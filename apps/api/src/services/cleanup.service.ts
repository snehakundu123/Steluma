import { prisma } from '../lib/prisma.js'
import { redis, KEYS } from '../lib/redis.js'
import { logger } from '../lib/logger.js'

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000    // run every 5 minutes
const PENDING_TICKET_TTL_MINUTES = 30          // abandon PENDING tickets older than 30 min
const PENDING_SALE_TTL_MINUTES = 6             // revert PENDING_SALE listings after 6 min

export function startCleanupJob(): void {
  logger.info('[Cleanup] Background cleanup job started')
  const run = async () => {
    try {
      await Promise.allSettled([
        cleanupStalePendingTickets(),
        cleanupExpiredListings(),
        cleanupStalePendingSaleListings(),
        cleanupExpiredAuthNonces(),
      ])
    } catch (err) {
      logger.error('[Cleanup] Unexpected error', { err })
    }
    setTimeout(run, CLEANUP_INTERVAL_MS)
  }
  setTimeout(run, 30_000) // first run 30s after startup
}

async function cleanupStalePendingTickets(): Promise<void> {
  const cutoff = new Date(Date.now() - PENDING_TICKET_TTL_MINUTES * 60 * 1000)
  const result = await prisma.ticket.updateMany({
    where: { status: 'PENDING', createdAt: { lt: cutoff } },
    data: { status: 'CANCELLED' },
  })
  if (result.count > 0) {
    logger.info('[Cleanup] Cancelled stale PENDING tickets', { count: result.count })
  }
}

async function cleanupExpiredListings(): Promise<void> {
  const now = new Date()
  const result = await prisma.$transaction(async (tx) => {
    const expired = await tx.marketplaceListing.findMany({
      where: { status: 'ACTIVE', expiresAt: { lt: now } },
      select: { id: true, ticketId: true },
    })
    if (!expired.length) return { count: 0 }

    const ids = expired.map((l) => l.id)
    const ticketIds = expired.map((l) => l.ticketId)

    await tx.marketplaceListing.updateMany({
      where: { id: { in: ids } },
      data: { status: 'EXPIRED' },
    })
    await tx.ticket.updateMany({
      where: { id: { in: ticketIds }, status: 'LISTED' },
      data: { status: 'ACTIVE' },
    })
    return { count: expired.length }
  })
  if (result.count > 0) {
    logger.info('[Cleanup] Expired marketplace listings', { count: result.count })
  }
}

async function cleanupStalePendingSaleListings(): Promise<void> {
  const cutoff = new Date(Date.now() - PENDING_SALE_TTL_MINUTES * 60 * 1000)
  const stalePending = await prisma.marketplaceListing.findMany({
    where: { status: 'PENDING_SALE' as any, listedAt: { lt: cutoff } },
    select: { id: true, ticketId: true },
  })

  for (const listing of stalePending) {
    try {
      await prisma.$transaction([
        prisma.marketplaceListing.update({
          where: { id: listing.id },
          data: { status: 'ACTIVE' as any, buyerId: null, buyerWallet: null },
        }),
        prisma.ticket.update({
          where: { id: listing.ticketId, status: 'LISTED' },
          data: { status: 'LISTED' }, // keep LISTED since it's relisted
        }),
      ])
      // Release buy lock if still set
      await redis.del(KEYS.buyLock(listing.id))
      logger.info('[Cleanup] Reverted stale PENDING_SALE listing', { listingId: listing.id })
    } catch (err) {
      logger.warn('[Cleanup] Failed to revert PENDING_SALE listing', { listingId: listing.id, err })
    }
  }
}

async function cleanupExpiredAuthNonces(): Promise<void> {
  const result = await prisma.authNonce.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })
  if (result.count > 0) {
    logger.debug('[Cleanup] Deleted expired auth nonces', { count: result.count })
  }
}
