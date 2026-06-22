import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as EventService from '../services/event.service.js'
import { prisma } from '../lib/prisma.js'

// Prisma returns BigInt for onChainEventId / totalRevenue / maxResalePrice.
// Fastify's JSON serializer doesn't handle BigInt — convert to string everywhere.
function serializeEvent(event: any): any {
  if (!event) return event
  return {
    ...event,
    onChainEventId: event.onChainEventId?.toString() ?? null,
    totalRevenue: event.totalRevenue?.toString() ?? '0',
    maxResalePrice: event.maxResalePrice?.toString() ?? null,
    stakeRequired: event.stakeRequired?.toString() ?? null,
    ticketTiers: event.ticketTiers?.map((t: any) => ({
      ...t,
      price: t.price?.toString(),
      maxResalePrice: t.maxResalePrice?.toString() ?? null,
      available: t.totalSupply - t.sold,   // always computed so UI never has to guess
    })),
    organizer: event.organizer ? {
      ...event.organizer,
      totalRevenue: event.organizer.totalRevenue?.toString() ?? '0',
      averageRating: Number(event.organizer.averageRating ?? 0),
    } : undefined,
    stake: event.stake ? {
      ...event.stake,
      amount: event.stake.amount?.toString(),
    } : undefined,
  }
}

function serializeEventList(result: any): any {
  if (!result) return result
  if (Array.isArray(result)) return result.map(serializeEvent)
  if (result.data) return { ...result, data: result.data.map(serializeEvent) }
  return result
}

const createEventSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10),
  category: z.enum(['CONFERENCE', 'CONCERT', 'SPORTS', 'COMMUNITY', 'WORKSHOP', 'HACKATHON', 'NETWORKING', 'FESTIVAL', 'WEBINAR', 'OTHER']),
  locationType: z.enum(['PHYSICAL', 'VIRTUAL', 'HYBRID']),
  locationAddress: z.string().optional(),
  locationCity: z.string().optional(),
  locationCountry: z.string().optional(),
  locationLat: z.number().optional(),
  locationLng: z.number().optional(),
  virtualLink: z.string().url().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  timezone: z.string().default('UTC'),
  maxResalePrice: z.number().positive().optional(),
  royaltyBps: z.number().min(0).max(2000).default(500),
  refundPolicy: z.string().optional(),
  tags: z.array(z.string()).max(10).default([]),
  ticketTiers: z.array(z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    price: z.number().min(0),
    priceAsset: z.string().default('XLM'),
    totalSupply: z.number().int().positive(),
    isTransferable: z.boolean().default(true),
    maxPerWallet: z.number().int().positive().default(10),
    saleStartsAt: z.string().datetime().optional(),
    saleEndsAt: z.string().datetime().optional(),
    perks: z.array(z.string()).default([]),
    badgeType: z.enum(['ATTENDEE', 'VIP', 'SPEAKER', 'ORGANIZER', 'VOLUNTEER', 'EARLY_BIRD']).default('ATTENDEE'),
  })).min(1).max(20),
})
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: 'Event end time must be after the start time',
    path: ['endsAt'],
  })
  .refine((d) => new Date(d.endsAt) > new Date(), {
    message: 'Event end time must be in the future',
    path: ['endsAt'],
  })

const publishSchema = z.object({
  stakeTxHash: z.string().min(1),
  onChainEventId: z.coerce.bigint().optional().catch(undefined),
})

const discoverySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  priceMin: z.coerce.number().optional(),
  priceMax: z.coerce.number().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sort: z.enum(['trending', 'date', 'price']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export async function eventRoutes(app: FastifyInstance) {
  // Discovery — public
  app.get('/', async (req, reply) => {
    const filters = discoverySchema.parse(req.query)
    const result = await EventService.discoverEvents(filters as any)
    return reply.send(serializeEventList(result))
  })

  // Get event by slug — public
  app.get('/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const event = await EventService.getEventBySlug(slug)
    if (!event) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Event not found' } })
    return reply.send(serializeEvent(event))
  })

  // Full management view — organizer only
  app.get('/:slug/management', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const user = req.user as any

    const event = await prisma.event.findFirst({
      where: { slug, organizer: { walletAddress: user.wallet } },
      include: {
        ticketTiers: { orderBy: { sortOrder: 'asc' } },
        tickets: {
          where: { status: { not: 'CANCELLED' } },
          orderBy: { createdAt: 'desc' },
          include: { tier: { select: { name: true } }, owner: { select: { walletAddress: true, displayName: true } } },
        },
        checkIns: { select: { ticketId: true, checkedInAt: true } },
      },
    })
    if (!event) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not your event' } })

    const checkedInTicketIds = new Map(event.checkIns.map((c) => [c.ticketId, c.checkedInAt]))
    const totalRevenue = event.tickets.reduce((sum, t) => sum + Number(t.purchasePrice ?? 0), 0)

    const salesByTier = event.ticketTiers.map((t) => ({
      tierId: t.id,
      name: t.name,
      sold: t.sold,
      total: t.totalSupply,
      revenue: (Number(t.price) * t.sold).toFixed(2),
      pctSold: t.totalSupply > 0 ? Math.round((t.sold / t.totalSupply) * 100) : 0,
    }))

    return reply.send({
      event: {
        id: event.id,
        title: event.title,
        slug: event.slug,
        status: event.status,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
        category: event.category,
        locationCity: event.locationCity,
        bannerUrl: event.bannerUrl,
        royaltyBps: event.royaltyBps,
        maxResalePrice: event.maxResalePrice?.toString() ?? undefined,
        refundPolicy: event.refundPolicy ?? undefined,
      },
      summary: {
        totalRevenue: totalRevenue.toFixed(2),
        ticketsSold: event.ticketsSold,
        totalCapacity: event.totalTickets,
        checkedIn: event.checkIns.length,
        avgTicketPrice: event.ticketsSold > 0 ? (totalRevenue / event.ticketsSold).toFixed(2) : '0',
        checkInRate: event.ticketsSold > 0 ? ((event.checkIns.length / event.ticketsSold) * 100).toFixed(1) : '0',
        pageViews: event.viewCount,
      },
      salesByTier,
      recentPurchases: event.tickets.slice(0, 10).map((t) => ({
        id: t.id,
        purchasedAt: t.createdAt.toISOString(),
        amount: t.purchasePrice?.toString() ?? '0',
        buyer: { walletAddress: t.owner.walletAddress, displayName: t.owner.displayName },
        tierName: t.tier.name,
        ticketNumber: t.ticketNumber,
      })),
      attendees: event.tickets.map((t) => ({
        id: t.id,
        walletAddress: t.owner.walletAddress,
        displayName: t.owner.displayName,
        tierName: t.tier.name,
        purchasedAt: t.createdAt.toISOString(),
        checkedIn: checkedInTicketIds.has(t.id),
        checkedInAt: checkedInTicketIds.get(t.id)?.toISOString(),
      })),
    })
  })

  // Create event — organizer required
  app.post('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as any
    const data = createEventSchema.parse(req.body)

    // Ensure organizer profile exists
    let organizer = await prisma.organizerProfile.findUnique({ where: { userId: user.sub } })
    if (!organizer) {
      // Auto-create organizer profile
      organizer = await prisma.organizerProfile.create({
        data: {
          userId: user.sub,
          walletAddress: user.wallet,
        },
      })
      await prisma.user.update({ where: { id: user.sub }, data: { role: 'ORGANIZER' } })
    }

    const event = await EventService.createEvent(user.sub, {
      ...data,
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
      ticketTiers: data.ticketTiers.map((t) => ({
        ...t,
        saleStartsAt: t.saleStartsAt ? new Date(t.saleStartsAt) : undefined,
        saleEndsAt: t.saleEndsAt ? new Date(t.saleEndsAt) : undefined,
      })),
    })

    return reply.status(201).send(serializeEvent(event))
  })

  // Publish event
  app.post('/:id/publish', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { stakeTxHash, onChainEventId } = publishSchema.parse(req.body)
    const user = req.user as any

    try {
      const event = await EventService.publishEvent(id, user.sub, stakeTxHash, onChainEventId)
      return reply.send(serializeEvent(event))
    } catch (err: any) {
      return reply.status(400).send({ error: { code: err.message, message: err.message } })
    }
  })

  // Get event analytics — organizer only
  app.get('/:id/analytics', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = req.user as any

    const event = await prisma.event.findFirst({
      where: { id, organizer: { userId: user.sub } },
    })
    if (!event) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not your event' } })

    const [checkIns, revenue, ticketsByTier] = await Promise.all([
      prisma.checkIn.count({ where: { eventId: id } }),
      prisma.ticket.aggregate({
        where: { eventId: id, status: { not: 'CANCELLED' } },
        _sum: { purchasePrice: true },
      }),
      prisma.ticketTier.findMany({
        where: { eventId: id },
        select: { id: true, name: true, sold: true, price: true },
      }),
    ])

    return reply.send({
      summary: {
        totalRevenue: revenue._sum.purchasePrice?.toString() ?? '0',
        ticketsSold: event.ticketsSold,
        checkedIn: checkIns,
        pageViews: event.viewCount,
      },
      byTier: ticketsByTier.map((t) => ({
        tierId: t.id,
        name: t.name,
        sold: t.sold,
        revenue: (Number(t.price) * t.sold).toFixed(7),
      })),
    })
  })

  // Update event — organizer only, pre-publish fields
  app.patch('/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = req.user as any

    const event = await prisma.event.findFirst({
      where: { id, organizer: { userId: user.sub } },
    })
    if (!event) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not your event' } })

    const updateSchema = z.object({
      description: z.string().min(10).optional(),
      virtualLink: z.string().url().optional(),
      refundPolicy: z.string().optional(),
      tags: z.array(z.string()).max(10).optional(),
    })
    const data = updateSchema.parse(req.body)

    const updated = await prisma.event.update({ where: { id }, data })
    return reply.send(serializeEvent(updated))
  })

  // Cancel event — organizer only
  app.post('/:id/cancel', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = req.user as any

    const event = await prisma.event.findFirst({
      where: { id, organizer: { userId: user.sub }, status: { in: ['DRAFT', 'STAKED', 'ACTIVE'] } },
      include: { organizer: true },
    })
    if (!event) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not your event or cannot cancel' } })

    const wasPublished = event.status === 'ACTIVE'
    await prisma.event.update({ where: { id }, data: { status: 'CANCELLED' } })

    // Decrement counter only if it was ACTIVE (published)
    if (wasPublished) {
      await prisma.organizerProfile.update({
        where: { id: event.organizer.id },
        data: { totalEventsHosted: { decrement: 1 } },
      })
    }

    return reply.send({ status: 'CANCELLED' })
  })
}
