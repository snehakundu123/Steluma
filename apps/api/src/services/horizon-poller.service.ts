import * as StellarSdk from '@stellar/stellar-sdk'
import { prisma } from '../lib/prisma.js'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'
import { notifyTicketPurchased, notifyBadgeEarned, notifyStakeReleased } from './notification.service.js'

// Use StellarSdk.rpc directly; SorobanRpc alias caused a TS namespace error

const POLL_INTERVAL_MS = 5000
const CONTRACTS = {
  eventFactory: env.EVENT_FACTORY_CONTRACT_ID,
  ticketNft: env.TICKET_NFT_CONTRACT_ID,
  attendanceBadge: env.ATTENDANCE_BADGE_CONTRACT_ID,
  staking: env.STAKING_CONTRACT_ID,
  marketplace: env.MARKETPLACE_CONTRACT_ID,
}

// Track last processed ledger per contract (initialized to latest ledger on startup)
const lastLedger: Record<string, number> = {}

let isPolling = false
let latestLedger = 0

async function fetchLatestLedger(soroban: StellarSdk.rpc.Server): Promise<number> {
  try {
    const health = await soroban.getHealth()
    return (health as any).ledgerVersion ?? (health as any).latestLedger ?? 0
  } catch {
    try {
      // Fallback: use getLatestLedger
      const res = await (soroban as any).getLatestLedger()
      return res.sequence ?? 0
    } catch {
      return 0
    }
  }
}

export async function startHorizonPoller(): Promise<void> {
  if (isPolling) return
  isPolling = true

  const hasContracts = Object.values(CONTRACTS).some(Boolean)
  if (!hasContracts) {
    logger.info('[Poller] No contract IDs configured — skipping horizon polling')
    return
  }

  logger.info('[Poller] Starting Horizon polling', { interval: POLL_INTERVAL_MS })

  async function poll() {
    try {
      await pollContractEvents()
    } catch (err) {
      logger.error('[Poller] Poll cycle error', { err })
    }
    setTimeout(poll, POLL_INTERVAL_MS)
  }

  // Start with a delay to let server warm up
  setTimeout(poll, 3000)
}

async function pollContractEvents(): Promise<void> {
  const soroban = new StellarSdk.rpc.Server(env.STELLAR_RPC_URL)

  // Bootstrap: fetch current ledger so we only process new events, not the full history
  if (latestLedger === 0) {
    try {
      const res = await soroban.getLatestLedger()
      latestLedger = (res as any).sequence ?? 0
      logger.info('[Poller] Bootstrap ledger', { latestLedger })
    } catch (err) {
      logger.debug('[Poller] Could not fetch latest ledger', { err })
      return
    }
  }

  const contractsToWatch = Object.entries(CONTRACTS).filter(([, id]) => !!id)
  if (contractsToWatch.length === 0) return

  for (const [name, contractId] of contractsToWatch) {
    if (!contractId) continue
    try {
      await pollSingleContract(soroban, name, contractId)
    } catch (err) {
      logger.debug(`[Poller] Error polling ${name}`, { err })
    }
  }
}

async function pollSingleContract(
  soroban: StellarSdk.rpc.Server,
  name: string,
  contractId: string,
): Promise<void> {
  // Use lastLedger+1 if we've seen events, else start from the bootstrap ledger
  const startLedger = lastLedger[contractId]
    ? lastLedger[contractId] + 1
    : latestLedger

  if (startLedger <= 0) return

  const events = await soroban.getEvents({
    startLedger,
    filters: [{ type: 'contract', contractIds: [contractId] }],
    limit: 100,
  } as any)

  if (!events.events || events.events.length === 0) return

  logger.debug(`[Poller] ${events.events.length} events from ${name}`)

  for (const event of events.events) {
    try {
      await processEvent(name, event)
      const ledger = Number((event as any).ledger ?? 0)
      if (ledger > (lastLedger[contractId] ?? 0)) {
        lastLedger[contractId] = ledger
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      logger.warn('[Poller] Event processing error', { contractName: name, errMsg, ledger: (event as any).ledger })
    }
  }
}

/**
 * Decode a topic value from getEvents.
 *
 * In Stellar SDK 13.x, getEvents returns topic items as plain JS objects
 * (internally serialized xdr.ScVal) — not live xdr.ScVal instances — so
 * scValToNative fails with "scv.switch is not a function".
 * We inspect the _switch.name field and extract the value directly.
 */
function decodeScVal(raw: any): unknown {
  if (raw === null || raw === undefined) return raw
  const typeName: string = raw._switch?.name ?? ''

  switch (typeName) {
    case 'scvSymbol': {
      const buf = raw._value?.data ?? raw._value
      return Buffer.isBuffer(buf) ? buf.toString('utf8')
        : Array.isArray(buf) ? Buffer.from(buf).toString('utf8')
        : String(buf)
    }
    case 'scvString': {
      const buf = raw._value?.data ?? raw._value
      return Buffer.isBuffer(buf) ? buf.toString('utf8')
        : Array.isArray(buf) ? Buffer.from(buf).toString('utf8')
        : String(buf)
    }
    case 'scvU64':
    case 'scvI64':
      return BigInt(raw._value?._value ?? raw._value ?? 0)
    case 'scvU32':
    case 'scvI32':
      return Number(raw._value?._value ?? raw._value ?? 0)
    case 'scvU128':
    case 'scvI128': {
      const hi = BigInt(raw._value?.hi?._value ?? raw._value?.hi ?? 0)
      const lo = BigInt(raw._value?.lo?._value ?? raw._value?.lo ?? 0)
      return (hi << 64n) | lo
    }
    case 'scvBool':
      return Boolean(raw._value)
    case 'scvAddress': {
      // Structure: scvAddress._value → scAddressTypeAccount._value → publicKeyTypeEd25519._value → Buffer
      const inner = raw._value
      if (inner?._switch?.name === 'scAddressTypeAccount') {
        // inner._value is the publicKeyTypeEd25519 object; its ._value is {type:'Buffer',data:[...]}
        const keyObj = inner._value
        const ed25519Raw = keyObj?._value ?? keyObj
        const dataArr = ed25519Raw?.data ?? ed25519Raw
        if (dataArr) {
          try {
            return StellarSdk.StrKey.encodeEd25519PublicKey(
              Buffer.isBuffer(dataArr) ? dataArr : Buffer.from(dataArr),
            )
          } catch { /* fall through */ }
        }
      }
      return String(raw)
    }
    case 'scvVec':
      return (raw._value ?? []).map((item: any) => decodeScVal(item))
    case 'scvMap': {
      const result: Record<string, unknown> = {}
      for (const entry of raw._value ?? []) {
        const key = decodeScVal(entry._attributes?.key ?? entry.key)
        const val = decodeScVal(entry._attributes?.val ?? entry.val)
        result[String(key)] = val
      }
      return result
    }
    case 'scvVoid':
      return null
    default:
      // Fallback: attempt scValToNative if it's actually a live xdr.ScVal
      try { return StellarSdk.scValToNative(raw) } catch { return String(raw) }
  }
}

async function processEvent(contractName: string, event: any): Promise<void> {
  const topics = (event.topic ?? []).map((t: any) => decodeScVal(t))
  const eventType = topics[1]
  logger.debug('[Poller] Processing event', { contractName, eventType })

  switch (contractName) {
    case 'ticketNft':
      if (eventType === 'minted') await handleTicketMinted(event, topics)
      if (eventType === 'locked') await handleTicketLocked(event, topics)
      break

    case 'attendanceBadge':
      if (eventType === 'minted') await handleBadgeMinted(event, topics)
      break

    case 'staking':
      if (eventType === 'staked') await handleStakeConfirmed(event, topics)
      if (eventType === 'released') await handleStakeReleased(event, topics)
      break

    case 'marketplace':
      if (eventType === 'sold') await handleMarketplaceSale(event, topics)
      break
  }
}

async function handleTicketMinted(event: any, topics: any[]): Promise<void> {
  // topics[2] is the on-chain token ID (u64) from the contract event
  const onChainTokenId = BigInt(String(topics[2] ?? 0))
  if (!onChainTokenId) return

  // Find a CONFIRMING ticket that doesn't yet have an on-chain token ID.
  // We match by txHash first (most precise), then fall back to any CONFIRMING ticket
  // for the same event — the poller runs within seconds of minting so false matches
  // are unlikely, and the lock/lock guard prevents duplicate ACTIVE transitions.
  const ticket = await prisma.ticket.findFirst({
    where: {
      onChainTokenId: null,
      status: 'CONFIRMING',
      ...(event.txHash ? { mintTxHash: event.txHash } : {}),
    },
  })
  if (!ticket) return

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      status: 'ACTIVE',
      onChainTokenId,
      mintTxHash: event.txHash ?? ticket.mintTxHash,
    },
  })

  logger.info('[Poller] Ticket confirmed on-chain', { onChainTokenId: onChainTokenId.toString(), dbId: ticket.id })
}

async function handleTicketLocked(event: any, topics: any[]): Promise<void> {
  const onChainTokenId = BigInt(String(topics[2] ?? 0))
  if (!onChainTokenId) return

  await prisma.ticket.updateMany({
    where: { onChainTokenId },
    data: { status: 'CHECKED_IN' },
  })
  logger.info('[Poller] Ticket locked on-chain', { onChainTokenId: onChainTokenId.toString() })
}

async function handleBadgeMinted(event: any, topics: any[]): Promise<void> {
  const onChainBadgeId = BigInt(String(topics[2] ?? 0))
  if (!onChainBadgeId) return

  // Match by txHash if available, otherwise find any MINTING badge without an on-chain ID
  const badge = await prisma.attendanceBadge.findFirst({
    where: {
      mintStatus: 'MINTING',
      onChainTokenId: null,
      ...(event.txHash ? { mintTxHash: event.txHash } : {}),
    },
    include: { event: true, user: true },
  })
  if (!badge) return

  await prisma.attendanceBadge.update({
    where: { id: badge.id },
    data: {
      mintStatus: 'MINTED',
      onChainTokenId: onChainBadgeId,
      mintTxHash: event.txHash ?? null,
    },
  })

  await notifyBadgeEarned(badge.userId, badge.badgeType, badge.event.title, badge.id)
  logger.info('[Poller] Badge confirmed on-chain', { onChainBadgeId: onChainBadgeId.toString(), dbId: badge.id })
}

async function handleStakeConfirmed(event: any, topics: any[]): Promise<void> {
  const eventId = Number(topics[2])
  if (!eventId) return

  const dbEvent = await prisma.event.findFirst({
    where: { onChainEventId: BigInt(eventId) },
  })
  if (!dbEvent) return

  await prisma.organizerStake.updateMany({
    where: { eventId: dbEvent.id, status: 'PENDING' },
    data: { status: 'STAKED', stakedAt: new Date(), stakeTxHash: event.txHash ?? null },
  })

  logger.info('[Poller] Stake confirmed on-chain', { eventId, dbEventId: dbEvent.id })
}

async function handleStakeReleased(event: any, topics: any[]): Promise<void> {
  const eventId = Number(topics[2])
  if (!eventId) return

  const dbEvent = await prisma.event.findFirst({
    where: { onChainEventId: BigInt(eventId) },
    include: { organizer: { include: { user: true } }, stake: true },
  })
  if (!dbEvent) return

  await prisma.organizerStake.updateMany({
    where: { eventId: dbEvent.id, status: 'COMPLETED' },
    data: { status: 'RELEASED', releasedAt: new Date(), releaseTxHash: event.txHash ?? null },
  })

  if (dbEvent.stake && dbEvent.organizer.user) {
    await notifyStakeReleased(
      dbEvent.organizer.user.id,
      dbEvent.title,
      dbEvent.stake.amount.toString(),
      dbEvent.id,
    )
  }

  logger.info('[Poller] Stake released on-chain', { eventId })
}

async function handleMarketplaceSale(event: any, topics: any[]): Promise<void> {
  // topics: [contract_id_sym, "sold", listing_id_u64, buyer_addr, seller_addr, price_i128, royalty_i128]
  const onChainListingId = Number(topics[2])
  if (!onChainListingId) return

  // Look up listing by on-chain listing ID stored at list time
  const listing = await (prisma.marketplaceListing as any).findFirst({
    where: {
      onChainListingId: BigInt(onChainListingId),
      status: { in: ['ACTIVE', 'PENDING_SALE'] },
    },
    include: { seller: true, event: true },
  })
  if (!listing) {
    logger.debug('[Poller] Marketplace sale: no matching listing found', { onChainListingId })
    return
  }

  await prisma.$transaction([
    prisma.marketplaceListing.update({
      where: { id: listing.id },
      data: { status: 'SOLD', soldAt: new Date(), saleTxHash: event.txHash ?? null },
    }),
    prisma.ticket.update({
      where: { id: listing.ticketId },
      data: { status: 'TRANSFERRED' },
    }),
  ])

  logger.info('[Poller] Marketplace sale processed', { listingId: listing.id, onChainListingId })
}
