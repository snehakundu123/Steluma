import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { redis, KEYS } from '../lib/redis.js'
import { emitListingCreated, emitListingSold } from '../services/socket.service.js'
import { notifyListingSold } from '../services/notification.service.js'
import { logger } from '../lib/logger.js'

const BUY_LOCK_TTL = 5 * 60 // 5 minutes for buyer to sign and confirm

const listSchema = z.object({
  ticketId: z.string().uuid(),
  price: z.number().positive(),
  asset: z.string().default('XLM'),
  expiresAt: z.string().datetime().optional(),
})

const confirmBuySchema = z.object({
  txHash: z.string().min(1),
  buyerWallet: z.string().regex(/^G[A-Z2-7]{55}$/),
})

export async function marketplaceRoutes(app: FastifyInstance) {
  // Public listing discovery
  app.get('/', async (req, reply) => {
    const { eventId, priceMin, priceMax, sort = 'newest', page = 1, limit = 20 } = req.query as any

    const where: any = { status: 'ACTIVE' }
    if (eventId) where.eventId = eventId
    if (priceMin !== undefined) where.price = { gte: Number(priceMin) }
    if (priceMax !== undefined) where.price = { ...where.price, lte: Number(priceMax) }

    const orderBy: any =
      sort === 'price_asc' ? { price: 'asc' }
      : sort === 'price_desc' ? { price: 'desc' }
      : { listedAt: 'desc' }

    const [listings, total] = await Promise.all([
      prisma.marketplaceListing.findMany({
        where,
        orderBy,
        skip: (Number(page) - 1) * Number(limit),
        take: Math.min(Number(limit), 100),
        include: {
          ticket: { include: { tier: true } },
          event: { select: { id: true, title: true, startsAt: true, bannerUrl: true } },
          seller: { select: { walletAddress: true, displayName: true } },
        },
      }),
      prisma.marketplaceListing.count({ where }),
    ])

    return reply.send({
      data: listings.map((l) => ({
        ...l,
        price: l.price.toString(),
        maxPrice: l.maxPrice?.toString() ?? null,
        salePrice: l.salePrice?.toString() ?? null,
        royaltyPaid: l.royaltyPaid?.toString() ?? null,
        onChainListingId: l.onChainListingId?.toString() ?? null,
      })),
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        hasNextPage: (Number(page) - 1) * Number(limit) + listings.length < total,
        hasPrevPage: Number(page) > 1,
      },
    })
  })

  // List a ticket for resale
  app.post('/list', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as any
    const { ticketId, price, asset, expiresAt } = listSchema.parse(req.body)

    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, ownerId: user.sub, status: 'ACTIVE' },
      include: { event: true, tier: true },
    })
    if (!ticket) {
      return reply.status(404).send({ error: { code: 'TICKET_NOT_FOUND', message: 'Ticket not found or not eligible' } })
    }
    if (!ticket.tier.isTransferable) {
      return reply.status(400).send({ error: { code: 'TRANSFER_RESTRICTED', message: 'Ticket is non-transferable' } })
    }

    const activeListingExists = await prisma.marketplaceListing.findFirst({
      where: { ticketId, status: { in: ['ACTIVE', 'PENDING_SALE'] as any[] } },
    })
    if (activeListingExists) {
      return reply.status(409).send({ error: { code: 'TICKET_ALREADY_LISTED', message: 'Ticket already listed' } })
    }

    if (ticket.event.maxResalePrice && price > Number(ticket.event.maxResalePrice)) {
      return reply.status(400).send({
        error: { code: 'EXCEEDS_MAX_RESALE_PRICE', message: `Max resale price is ${ticket.event.maxResalePrice}` },
      })
    }

    const organizer = await prisma.organizerProfile.findUnique({
      where: { id: ticket.event.organizerId },
    })

    const listing = await prisma.$transaction(async (tx) => {
      const l = await tx.marketplaceListing.create({
        data: {
          ticketId,
          eventId: ticket.eventId,
          sellerId: user.sub,
          sellerWallet: user.wallet,
          price,
          asset,
          royaltyBps: ticket.event.royaltyBps,
          royaltyRecipient: organizer?.walletAddress ?? user.wallet,
          maxPrice: ticket.event.maxResalePrice ? Number(ticket.event.maxResalePrice) : null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
      })
      await tx.ticket.update({ where: { id: ticketId }, data: { status: 'LISTED' } })
      return l
    })

    emitListingCreated(ticket.eventId, ticket.tier.name, price.toString(), listing.id)

    return reply.status(201).send({ id: listing.id, status: listing.status })
  })

  // Initiate a buy — returns transaction details, atomically reserves the listing.
  // No request body needed — uses auth identity only.
  app.post('/:listingId/buy', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { listingId } = req.params as { listingId: string }
    const user = req.user as any

    // Atomic reservation: only one buyer can hold the listing at a time
    const buyLockKey = KEYS.buyLock(listingId)
    const buyerToken = user.sub + ':' + Date.now()
    const lockAcquired = await redis.set(buyLockKey, buyerToken, 'EX', BUY_LOCK_TTL, 'NX')
    if (!lockAcquired) {
      // Check if this same buyer already holds the lock (idempotent retry)
      const existingHolder = await redis.get(buyLockKey)
      if (!existingHolder?.startsWith(user.sub + ':')) {
        return reply.status(409).send({
          error: { code: 'LISTING_RESERVED', message: 'Another buyer is completing this purchase. Try again in a few minutes.' },
        })
      }
    }

    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      include: { ticket: { include: { tier: true } }, event: true },
    })

    if (!listing || listing.status !== 'ACTIVE') {
      await redis.del(buyLockKey)
      return reply.status(404).send({ error: { code: 'LISTING_NOT_FOUND', message: 'Listing not found or not active' } })
    }
    if (listing.sellerId === user.sub) {
      await redis.del(buyLockKey)
      return reply.status(400).send({ error: { code: 'CANNOT_BUY_OWN', message: 'Cannot buy your own listing' } })
    }
    if (listing.ticket.status === 'CHECKED_IN') {
      await redis.del(buyLockKey)
      return reply.status(400).send({ error: { code: 'TICKET_CHECKED_IN', message: 'This ticket has already been used' } })
    }

    // Mark listing as PENDING_SALE so no other buyer can reserve it
    await prisma.marketplaceListing.update({
      where: { id: listingId },
      data: { status: 'PENDING_SALE' as any, buyerId: user.sub },
    })

    // Build the payment transaction for the buyer to sign
    const royaltyAmount = (Number(listing.price) * listing.royaltyBps) / 10000
    const sellerAmount = Number(listing.price) - royaltyAmount

    const reservedUntil = new Date(Date.now() + BUY_LOCK_TTL * 1000).toISOString()

    logger.info('[Marketplace] buy initiated', { listingId, buyer: user.sub, seller: listing.sellerId })

    return reply.send({
      status: 'RESERVED',
      reservedUntil,
      transaction: {
        description: 'Send this payment to complete the purchase',
        totalAmount: listing.price.toString(),
        royaltyAmount: royaltyAmount.toFixed(7),
        sellerAmount: sellerAmount.toFixed(7),
        sellerWallet: listing.sellerWallet,
        royaltyRecipient: listing.royaltyRecipient,
        asset: listing.asset,
      },
      listing: {
        id: listing.id,
        ticketId: listing.ticketId,
        eventTitle: listing.event.title,
        tierName: listing.ticket.tier.name,
        ticketNumber: listing.ticket.ticketNumber,
      },
    })
  })

  // Confirm a marketplace purchase after the buyer has submitted the tx on-chain
  app.post('/:listingId/confirm-buy', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { listingId } = req.params as { listingId: string }
    const user = req.user as any
    const { txHash, buyerWallet } = confirmBuySchema.parse(req.body)

    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      include: { ticket: { include: { tier: true } }, seller: true },
    })

    if (!listing) {
      return reply.status(404).send({ error: { code: 'LISTING_NOT_FOUND', message: 'Listing not found' } })
    }

    // Only the buyer who reserved can confirm
    if (listing.buyerId !== user.sub) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not the reserved buyer' } })
    }

    // Must be PENDING_SALE (reserved) — if it reverted to ACTIVE, the reservation expired
    if ((listing.status as any) !== 'PENDING_SALE') {
      return reply.status(409).send({
        error: {
          code: listing.status === 'SOLD' ? 'ALREADY_SOLD' : 'RESERVATION_EXPIRED',
          message: listing.status === 'SOLD' ? 'Listing already sold' : 'Your reservation expired. Please try again.',
        },
      })
    }

    // Find the buyer's DB user record
    const buyerUser = await prisma.user.findUnique({ where: { walletAddress: buyerWallet } })
    if (!buyerUser || buyerUser.id !== user.sub) {
      return reply.status(400).send({ error: { code: 'WALLET_MISMATCH', message: 'Buyer wallet mismatch' } })
    }

    const royaltyAmount = (Number(listing.price) * listing.royaltyBps) / 10000

    // Atomically settle the sale: update listing, transfer ticket ownership
    await prisma.$transaction(async (tx) => {
      await tx.marketplaceListing.update({
        where: { id: listingId },
        data: {
          status: 'SOLD',
          soldAt: new Date(),
          saleTxHash: txHash,
          buyerWallet,
          buyerId: user.sub,
          salePrice: listing.price,
          royaltyPaid: royaltyAmount,
        },
      })

      // Transfer ticket to buyer in DB
      await tx.ticket.update({
        where: { id: listing.ticketId },
        data: {
          ownerId: user.sub,
          ownerWallet: buyerWallet,
          status: 'ACTIVE',
          isResale: true,
        },
      })
    })

    // Release the buy lock
    await redis.del(KEYS.buyLock(listingId))

    // Notify seller
    await notifyListingSold(
      listing.sellerId,
      listing.ticket.tier.name,
      listing.price.toString(),
      listingId,
    )

    emitListingSold(listingId, listing.price.toString(), buyerWallet)

    logger.info('[Marketplace] sale confirmed', { listingId, buyer: buyerWallet, seller: listing.sellerWallet })

    return reply.send({
      status: 'SOLD',
      ticketId: listing.ticketId,
      salePrice: listing.price.toString(),
      soldAt: new Date().toISOString(),
    })
  })

  // Cancel a listing
  app.delete('/:listingId', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { listingId } = req.params as { listingId: string }
    const user = req.user as any

    const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } })
    if (!listing || listing.sellerId !== user.sub) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not your listing' } })
    }
    if (listing.status !== 'ACTIVE') {
      return reply.status(400).send({ error: { code: 'NOT_ACTIVE', message: 'Listing is not active' } })
    }

    await prisma.$transaction([
      prisma.marketplaceListing.update({
        where: { id: listingId },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      }),
      prisma.ticket.update({
        where: { id: listing.ticketId },
        data: { status: 'ACTIVE' },
      }),
    ])

    return reply.send({ status: 'CANCELLED', cancelledAt: new Date().toISOString() })
  })
}
