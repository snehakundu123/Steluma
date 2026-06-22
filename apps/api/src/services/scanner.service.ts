import * as StellarSdk from '@stellar/stellar-sdk'
import { prisma } from '../lib/prisma.js'
import { validateQrToken } from './qr.service.js'
import { notifyBadgeEarned } from './notification.service.js'
import { invokeContract, readContract, u64ToScVal, addressToScVal, stringToScVal, adminKeypair } from '../lib/stellar.js'
import { buildBadgeMetadata } from './ipfs.service.js'
import { emitCheckIn, emitBadgeMinted } from './socket.service.js'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'

// Encode a Soroban contracttype unit-enum variant.
// Soroban encodes unit enum variants as scvVec([scvSymbol("VariantName")]).
// (scvMap was tried but is the wrong format — the on-chain events emit scvVec.)
function sorobanEnumVariant(variantName: string): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvVec([
    StellarSdk.xdr.ScVal.scvSymbol(variantName),
  ])
}

// Map DB BadgeType enum (SCREAMING_SNAKE_CASE) to Soroban variant names (PascalCase)
function badgeTypeToSorobanVariant(badgeType: string): string {
  const map: Record<string, string> = {
    ATTENDEE: 'Attendee',
    VIP: 'Vip',
    SPEAKER: 'Speaker',
    ORGANIZER: 'Organizer',
    VOLUNTEER: 'Volunteer',
    EARLY_BIRD: 'EarlyBird',
  }
  return map[badgeType] ?? 'Attendee'
}

export interface ScanResult {
  valid: boolean
  reason?: string
  // Flat convenience fields for the scanner UI
  attendeeName?: string | null
  tierName?: string
  checkIn?: {
    id: string
    checkedInAt: string
  }
  ticket?: {
    id: string
    ticketNumber: number
    tier: string
    perks: string[]
  }
  attendee?: {
    walletAddress: string
    displayName: string | null
    avatarUrl: string | null
  }
  badgeStatus?: string
  onChainLock?: boolean
}

export async function validateScan(
  qrToken: string,
  eventId: string,
  scannedByWallet: string,
  deviceInfo?: string,
): Promise<ScanResult> {
  // 1. Validate QR token (Ed25519 signature check)
  const qrResult = await validateQrToken(qrToken)
  if (!qrResult.valid || !qrResult.payload) {
    return { valid: false, reason: qrResult.reason }
  }

  const { ticketId, eventId: qrEventId, wallet } = qrResult.payload

  // 2. Check event match
  if (qrEventId !== eventId) {
    return { valid: false, reason: 'WRONG_EVENT' }
  }

  // 3. Fetch ticket with full info
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      owner: true,
      tier: true,
      event: true,
      checkIn: true,
    },
  })

  if (!ticket) return { valid: false, reason: 'TICKET_NOT_FOUND' }
  if (ticket.eventId !== eventId) return { valid: false, reason: 'WRONG_EVENT' }
  if (ticket.ownerWallet !== wallet) return { valid: false, reason: 'OWNERSHIP_MISMATCH' }
  if (ticket.status === 'CANCELLED') return { valid: false, reason: 'TICKET_CANCELLED' }
  if (ticket.status === 'CHECKED_IN' || ticket.checkIn) {
    return {
      valid: false,
      reason: 'ALREADY_CHECKED_IN',
      checkIn: ticket.checkIn
        ? { id: ticket.checkIn.id, checkedInAt: ticket.checkIn.checkedInAt.toISOString() }
        : undefined,
    }
  }

  // 4. Atomic check-in using DB transaction
  let checkIn: any
  try {
    checkIn = await prisma.$transaction(async (tx) => {
      // Re-check inside transaction
      const freshTicket = await tx.ticket.findUnique({
        where: { id: ticketId },
        include: { checkIn: true },
      })
      if (freshTicket?.checkIn) throw new Error('ALREADY_CHECKED_IN')
      if (freshTicket?.status === 'CANCELLED') throw new Error('TICKET_CANCELLED')

      const ci = await tx.checkIn.create({
        data: {
          ticketId,
          eventId,
          userId: ticket.ownerId,
          scannedBy: scannedByWallet,
          qrNonce: ticketId, // fixed QR — use ticketId as the stable nonce
          deviceInfo,
          isOnline: true,
        },
      })

      await tx.ticket.update({
        where: { id: ticketId },
        data: { status: 'CHECKED_IN' },
      })

      await tx.event.update({
        where: { id: eventId },
        data: { checkedInCount: { increment: 1 } },
      })

      return ci
    })
  } catch (err: any) {
    if (err.message === 'ALREADY_CHECKED_IN') {
      return { valid: false, reason: 'ALREADY_CHECKED_IN' }
    }
    throw err
  }

  // 5. Lock ticket on-chain (async, non-blocking)
  // lock(env, admin, ticket_id) — admin arg required; admin is also the tx signer
  const hasOnChainLock = !!(env.TICKET_NFT_CONTRACT_ID && ticket.onChainTokenId)
  if (hasOnChainLock) {
    invokeContract(env.TICKET_NFT_CONTRACT_ID, 'lock', [
      addressToScVal(adminKeypair.publicKey()),
      u64ToScVal(ticket.onChainTokenId!),
    ]).then(() => {
      logger.info('[Scanner] on-chain lock recorded', { ticketId, tokenId: ticket.onChainTokenId?.toString() })
    }).catch((err) => logger.error('[Scanner] on-chain lock failed', { err, ticketId }))
  }

  // 6. Trigger badge mint (async)
  mintBadgeAsync(ticket, eventId, checkIn.id).catch((err) =>
    logger.error('[Scanner] badge mint failed', { err }),
  )

  // 7. Emit real-time check-in to organizer dashboard
  emitCheckIn(eventId, checkIn.id, {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    tier: ticket.tier.name,
  }, {
    walletAddress: ticket.ownerWallet,
    displayName: ticket.owner.displayName,
    avatarUrl: ticket.owner.avatarIpfsCid
      ? `${env.IPFS_GATEWAY}/${ticket.owner.avatarIpfsCid}`
      : null,
  })

  return {
    valid: true,
    attendeeName: ticket.owner.displayName ?? ticket.ownerWallet.slice(0, 8) + '…',
    tierName: ticket.tier.name,
    onChainLock: hasOnChainLock,
    checkIn: { id: checkIn.id, checkedInAt: checkIn.checkedInAt.toISOString() },
    ticket: {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      tier: ticket.tier.name,
      perks: ticket.tier.perks,
    },
    attendee: {
      walletAddress: ticket.ownerWallet,
      displayName: ticket.owner.displayName,
      avatarUrl: ticket.owner.avatarIpfsCid
        ? `${env.IPFS_GATEWAY}/${ticket.owner.avatarIpfsCid}`
        : null,
    },
    badgeStatus: 'MINTING',
  }
}

async function mintBadgeAsync(ticket: any, eventId: string, checkInId: string) {
  const badgeType = ticket.tier.badgeType

  // Dedup check: prevent race if mintBadgeAsync is called twice for the same ticket
  const existingBadge = await prisma.attendanceBadge.findFirst({
    where: { userId: ticket.ownerId, eventId, badgeType },
  })
  if (existingBadge) return

  // Upload real badge metadata to IPFS
  let metadataUri = `ipfs://QmBadgePlaceholder/${ticket.id}`
  try {
    const eventTitle = ticket.event?.title ?? 'Steluma Event'
    const eventDate = ticket.event?.startsAt ? new Date(ticket.event.startsAt).toISOString().split('T')[0] : ''
    const ipfsResult = await buildBadgeMetadata(eventTitle, eventDate, badgeType, ticket.ownerWallet, eventId)
    metadataUri = `ipfs://${ipfsResult.cid}`
  } catch (ipfsErr) {
    logger.warn('[Badge] IPFS upload failed, using placeholder', { err: ipfsErr })
  }

  const badge = await prisma.attendanceBadge.create({
    data: {
      userId: ticket.ownerId,
      ownerWallet: ticket.ownerWallet,
      eventId,
      badgeType,
      metadataIpfsCid: metadataUri,
      mintStatus: 'MINTING',
    },
  })

  if (env.ATTENDANCE_BADGE_CONTRACT_ID) {
    const variantName = badgeTypeToSorobanVariant(badgeType)
    const onChainEventId = BigInt(ticket.event?.onChainEventId ?? 0)

    try {
      // Guard: check on-chain whether this badge was already issued in a prior run.
      // This prevents the contract's dedup panic ("badge already issued") from
      // marking the DB record as FAILED when the badge actually exists on-chain.
      let alreadyOnChain = false
      if (onChainEventId > 0n) {
        const hasBadge = await readContract(
          env.ATTENDANCE_BADGE_CONTRACT_ID,
          'has_badge',
          [
            addressToScVal(ticket.ownerWallet),
            u64ToScVal(onChainEventId),
            sorobanEnumVariant(variantName),
          ],
        ).catch(() => null)
        alreadyOnChain = hasBadge === true
      }

      if (alreadyOnChain) {
        logger.info('[Badge] already exists on-chain — marking MINTED without re-minting', {
          badgeId: badge.id, wallet: ticket.ownerWallet,
        })
        await prisma.attendanceBadge.update({
          where: { id: badge.id },
          data: { mintStatus: 'MINTED' },
        })
      } else {
        const txHash = await invokeContract(env.ATTENDANCE_BADGE_CONTRACT_ID, 'mint_badge', [
          addressToScVal(adminKeypair.publicKey()),
          addressToScVal(ticket.ownerWallet),
          u64ToScVal(onChainEventId),
          sorobanEnumVariant(variantName),
          stringToScVal(metadataUri),
        ])
        await prisma.attendanceBadge.update({
          where: { id: badge.id },
          data: { mintStatus: 'MINTED', mintTxHash: txHash },
        })
        logger.info('[Badge] minted on-chain', { txHash, badgeId: badge.id })
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const isTimeout = (err as any)?.isTimeout === true
      const submittedTxHash = (err as any)?.txHash as string | undefined

      if (isTimeout && submittedTxHash) {
        // Transaction was submitted but confirmation timed out — the Horizon poller
        // will update this to MINTED when the tx eventually lands on-chain.
        logger.warn('[Badge] mint tx pending (timeout) — poller will confirm', {
          txHash: submittedTxHash, badgeId: badge.id,
        })
        await prisma.attendanceBadge.update({
          where: { id: badge.id },
          data: { mintStatus: 'MINTING', mintTxHash: submittedTxHash },
        })
      } else {
        logger.error('[Badge] on-chain mint failed', { errMsg, badgeId: badge.id })
        await prisma.attendanceBadge.update({
          where: { id: badge.id },
          data: { mintStatus: 'FAILED' },
        })
      }
    }
  } else {
    await prisma.attendanceBadge.update({
      where: { id: badge.id },
      data: { mintStatus: 'MINTED' },
    })
  }

  await prisma.checkIn.update({
    where: { id: checkInId },
    data: { badgeMinted: true, badgeId: badge.id },
  })

  // Emit badge minted event to organizer dashboard
  emitBadgeMinted(eventId, badgeType, ticket.ownerWallet, badge.id)

  // Notify attendee
  const eventTitle = ticket.event?.title ?? 'your event'
  await notifyBadgeEarned(ticket.ownerId, badgeType, eventTitle, badge.id)

  logger.info('[Badge] minted', { badgeId: badge.id, userId: ticket.ownerId })
}
