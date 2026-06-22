import crypto from 'crypto'
import * as StellarSdk from '@stellar/stellar-sdk'
import { prisma } from '../lib/prisma.js'
import { redis, KEYS } from '../lib/redis.js'
import { invokeContract, u64ToScVal, addressToScVal, stringToScVal, symbolToScVal, boolToScVal, adminKeypair } from '../lib/stellar.js'
import { generateQrCode } from './qr.service.js'
import { buildTicketMetadata } from './ipfs.service.js'
import { notifyTicketPurchased } from './notification.service.js'
import { emitTicketSold } from './socket.service.js'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'

const PURCHASE_LOCK_TTL = 30 // seconds

export async function initiatePurchase(
  userId: string,
  eventId: string,
  tierId: string,
  quantity: number,
  buyerWallet: string,
) {
  const [event, tier, user] = await Promise.all([
    prisma.event.findUnique({
      where: { id: eventId },
      include: { organizer: true }, // need organizer.walletAddress for payment destination
    }),
    prisma.ticketTier.findUnique({ where: { id: tierId } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ])

  if (!event || event.status !== 'ACTIVE') throw new Error('EVENT_NOT_AVAILABLE')
  if (!tier || tier.eventId !== eventId) throw new Error('TIER_NOT_FOUND')
  if (tier.sold + quantity > tier.totalSupply) throw new Error('TICKET_SOLD_OUT')

  // Check max per wallet
  const existingTickets = await prisma.ticket.count({
    where: { tierId, ownerWallet: buyerWallet, status: { not: 'CANCELLED' } },
  })
  if (existingTickets + quantity > tier.maxPerWallet) throw new Error('MAX_PER_WALLET_EXCEEDED')

  // Check sale window
  const now = new Date()
  if (tier.saleStartsAt && now < tier.saleStartsAt) throw new Error('SALE_NOT_STARTED')
  if (tier.saleEndsAt && now > tier.saleEndsAt) throw new Error('SALE_ENDED')

  // Acquire per-EVENT inventory lock (not per-tier) so ticket number assignment is atomic.
  // A per-tier lock would allow two tiers of the same event to race on the global ticket number counter.
  const lockKey = KEYS.eventTicketLock(eventId)
  const lockToken = crypto.randomBytes(8).toString('hex')
  const locked = await redis.set(lockKey, lockToken, 'EX', PURCHASE_LOCK_TTL, 'NX')
  if (!locked) throw new Error('PURCHASE_IN_PROGRESS')

  try {
    const purchaseId = crypto.randomUUID()
    const totalAmount = (Number(tier.price) * quantity).toFixed(7)

    // Validate destination — organizer wallet may have bad checksum in some records
    let destination = buyerWallet // safe fallback: buyer pays themselves (still on-chain proof)
    const rawDest = (event as any).organizer?.walletAddress
    if (rawDest) {
      try {
        StellarSdk.Keypair.fromPublicKey(rawDest) // throws if invalid
        destination = rawDest
      } catch {
        logger.warn('[Ticket] organizer wallet invalid, falling back to buyer', { rawDest, eventId })
      }
    }
    logger.info('[Ticket] purchase routing', { destination, buyer: buyerWallet, eventId })

    const account = await new StellarSdk.Horizon.Server(env.STELLAR_HORIZON_URL).loadAccount(buyerWallet)
    const txBuilder = new StellarSdk.TransactionBuilder(account, {
      fee: '100000', // 0.01 XLM — generous enough for testnet
      networkPassphrase: env.STELLAR_NETWORK_PASSPHRASE,
    })

    // For paid tickets: XLM payment; for free tickets: manageData as proof-of-purchase
    if (Number(totalAmount) > 0) {
      txBuilder.addOperation(
        StellarSdk.Operation.payment({
          destination,
          asset: StellarSdk.Asset.native(),
          amount: totalAmount,
        }),
      )
    } else {
      // Free ticket — use manageData as on-chain proof (costs only the base fee)
      txBuilder.addOperation(
        StellarSdk.Operation.manageData({
          name: 'steluma_claim',
          value: Buffer.from(purchaseId.slice(0, 20)),
        }),
      )
    }
    txBuilder.addMemo(StellarSdk.Memo.text(`steluma:${purchaseId.slice(0, 20)}`))
    txBuilder.setTimeout(120)

    const tx = txBuilder.build()

    // Assign ticket numbers inside a DB transaction while holding the Redis lock.
    // This guarantees no two concurrent purchases for the same event share a ticket number.
    const tickets = await prisma.$transaction(async (txPrisma) => {
      const lastTicket = await txPrisma.ticket.findFirst({
        where: { eventId },
        orderBy: { ticketNumber: 'desc' },
        select: { ticketNumber: true },
      })
      const startNumber = (lastTicket?.ticketNumber ?? 0) + 1

      const ticketData = Array.from({ length: quantity }, (_, i) => ({
        eventId,
        tierId,
        ownerId: userId,
        ownerWallet: buyerWallet,
        ticketNumber: startNumber + i,
        status: 'PENDING' as const,
        purchasePrice: tier.price,
        purchaseAsset: tier.priceAsset,
        purchaseTxHash: null,
        purchaseBatchId: purchaseId,
      })) as any[]
      await txPrisma.ticket.createMany({ data: ticketData })

      // Fetch the created tickets so we have their IDs
      return (txPrisma.ticket as any).findMany({
        where: { purchaseBatchId: purchaseId, status: 'PENDING' },
        select: { id: true },
      }) as Promise<Array<{ id: string }>>
    })

    return {
      purchaseId,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + PURCHASE_LOCK_TTL * 1000).toISOString(),
      totalAmount,
      asset: tier.priceAsset,
      transaction: {
        xdr: tx.toXDR(),
        networkPassphrase: env.STELLAR_NETWORK_PASSPHRASE,
        memo: `steluma:${purchaseId.slice(0, 20)}`,
      },
      ticketIds: tickets.map((t) => t.id),
    }
  } finally {
    const currentLock = await redis.get(lockKey)
    if (currentLock === lockToken) {
      await redis.del(lockKey)
    }
  }
}

export async function confirmPurchase(
  purchaseId: string,
  txHash: string,
  buyerWallet: string,
) {
  const pendingTickets = await (prisma.ticket as any).findMany({
    where: { purchaseBatchId: purchaseId, status: 'PENDING' },
    include: { event: true, tier: true },
  }) as any[]

  if (!pendingTickets.length) throw new Error('PURCHASE_NOT_FOUND')

  const event = pendingTickets[0].event
  const tier = pendingTickets[0].tier

  // Update tickets to CONFIRMING (ticket numbers already assigned at purchase initiation)
  await prisma.$transaction(async (tx) => {
    for (const ticket of pendingTickets) {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          status: 'CONFIRMING',
          purchaseTxHash: txHash,
        },
      })
    }

    await tx.ticketTier.update({
      where: { id: tier.id },
      data: { sold: { increment: pendingTickets.length } },
    })

    await tx.event.update({
      where: { id: event.id },
      data: {
        ticketsSold: { increment: pendingTickets.length },
        totalRevenue: {
          increment: Number(tier.price) * pendingTickets.length,
        },
      },
    })
  })

  // Trigger async mint
  mintTicketsAsync(pendingTickets.map((t) => t.id), event, tier, buyerWallet).catch((err) =>
    logger.error('[Ticket] async mint failed', { err }),
  )

  return {
    status: 'CONFIRMING',
    tickets: pendingTickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      status: 'CONFIRMING',
      estimatedMintTime: '~30 seconds',
    })),
  }
}

export async function retryMint(ticket: any) {
  await mintTicketsAsync([ticket.id], ticket.event, ticket.tier, ticket.ownerWallet)
}

async function mintTicketsAsync(
  ticketIds: string[],
  event: any,
  tier: any,
  ownerWallet: string,
) {
  for (const ticketId of ticketIds) {
    try {
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } })
      if (!ticket) continue

      // Upload real NFT metadata to IPFS via Pinata
      let metadataUri = `ipfs://QmPlaceholder/${ticketId}`
      try {
        const ipfsResult = await buildTicketMetadata(
          event.title,
          tier.name,
          ticket.ticketNumber,
          ownerWallet,
          event.id,
          ticketId,
        )
        metadataUri = `ipfs://${ipfsResult.cid}`
      } catch (ipfsErr) {
        logger.warn('[Ticket] IPFS upload failed, using placeholder', { ticketId, err: ipfsErr })
      }

      let onChainTokenId: bigint | null = null
      let mintTxHash: string | null = null

      if (env.TICKET_NFT_CONTRACT_ID) {
        // admin.require_auth() — pass adminKeypair.publicKey() as admin arg, ownerWallet as `to`
        mintTxHash = await invokeContract(env.TICKET_NFT_CONTRACT_ID, 'mint', [
          addressToScVal(adminKeypair.publicKey()),
          addressToScVal(ownerWallet),
          u64ToScVal(BigInt(event.onChainEventId ?? 0)),
          symbolToScVal(tier.badgeType ?? 'ATTENDEE'),
          StellarSdk.nativeToScVal(ticket.ticketNumber, { type: 'u32' }),
          stringToScVal(metadataUri),
          boolToScVal(tier.isTransferable),
        ])
        onChainTokenId = BigInt(ticket.ticketNumber)
      }

      const updatedTicket = await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          status: 'ACTIVE',
          mintTxHash,
          onChainTokenId,
          metadataIpfsCid: metadataUri,
        },
        include: { event: true, tier: true },
      })

      // Send purchase notification
      await notifyTicketPurchased(
        updatedTicket.ownerId,
        updatedTicket.event.title,
        updatedTicket.tier.name,
        updatedTicket.ticketNumber,
        updatedTicket.eventId,
      )

      // Emit real-time socket event
      const freshTier = await prisma.ticketTier.findUnique({ where: { id: updatedTicket.tierId } })
      if (freshTier) {
        emitTicketSold(
          updatedTicket.eventId,
          updatedTicket.tierId,
          freshTier.name,
          freshTier.sold,
          freshTier.totalSupply - freshTier.sold,
          updatedTicket.event.totalRevenue.toString(),
        )
      }

      logger.info('[Ticket] minted', { ticketId, mintTxHash })
    } catch (err: any) {
      logger.error('[Ticket] mint failed', { ticketId, err: err?.message ?? String(err) })
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: 'CONFIRMING' }, // Keep in confirming for retry
      })
    }
  }
}

export async function getTicketQr(ticketId: string, userId: string) {
  // Allow CONFIRMING tickets too — the purchase is paid for even if the NFT mint is pending
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, ownerId: userId, status: { in: ['ACTIVE', 'CONFIRMING'] } },
    include: { event: true },
  })

  if (!ticket) throw new Error('TICKET_NOT_FOUND')

  const { token, qrDataUrl, expiresAt } = await generateQrCode(
    ticket.id,
    ticket.eventId,
    ticket.ownerWallet,
  )

  return { payload: token, qrDataUrl, expiresAt }
}
