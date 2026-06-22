import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { z } from 'zod'

export async function organizerRoutes(app: FastifyInstance) {
  app.get('/:walletAddress', async (req, reply) => {
    const { walletAddress } = req.params as { walletAddress: string }

    const organizer = await prisma.organizerProfile.findUnique({
      where: { walletAddress },
      include: {
        user: true,
        events: {
          where: { status: 'ACTIVE', visibility: 'PUBLIC', deletedAt: null },
          orderBy: { startsAt: 'asc' },
          take: 10,
          include: { ticketTiers: { take: 1, orderBy: { price: 'asc' } } },
        },
      },
    })

    if (!organizer) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Organizer not found' } })
    }

    return reply.send({
      id: organizer.id,
      walletAddress: organizer.walletAddress,
      displayName: organizer.user.displayName,
      bio: organizer.user.bio,
      website: organizer.website,
      twitterHandle: organizer.twitterHandle,
      trustTier: organizer.trustTier,
      reputationScore: organizer.reputationScore,
      verificationStatus: organizer.verificationStatus,
      totalEventsHosted: organizer.totalEventsHosted,
      successfulEvents: organizer.successfulEvents,
      totalAttendeesServed: organizer.totalAttendeesServed,
      averageRating: Number(organizer.averageRating),
      ratingCount: organizer.ratingCount,
      events: { upcoming: organizer.events },
    })
  })

  // All organizer events with full stats — used by organizer events list page
  app.get('/me/events', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as any
    const { status } = req.query as { status?: string }

    const organizer = await prisma.organizerProfile.findUnique({ where: { userId: user.sub } })
    if (!organizer) return reply.status(403).send({ error: { code: 'NOT_ORGANIZER', message: 'Not an organizer' } })

    const where: any = { organizerId: organizer.id, deletedAt: null }
    if (status) where.status = status

    const events = await prisma.event.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        ticketTiers: { select: { id: true, name: true, price: true, totalSupply: true, sold: true, badgeType: true } },
        stake: { select: { status: true, amount: true, stakeTxHash: true } },
        _count: { select: { checkIns: true } },
      },
    })

    return reply.send({
      data: events.map((e) => ({
        id: e.id,
        title: e.title,
        slug: e.slug,
        category: e.category,
        status: e.status,
        locationType: e.locationType,
        locationCity: e.locationCity,
        locationCountry: e.locationCountry,
        bannerUrl: e.bannerUrl,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
        createdAt: e.createdAt.toISOString(),
        publishedAt: e.publishedAt?.toISOString() ?? null,
        onChainEventId: e.onChainEventId?.toString() ?? null,
        ticketsSold: e.ticketsSold,
        totalTickets: e.totalTickets,
        checkedIn: e._count.checkIns,
        revenue: e.totalRevenue.toString(),
        viewCount: e.viewCount,
        royaltyBps: e.royaltyBps,
        ticketTiers: e.ticketTiers.map((t) => ({
          ...t,
          price: t.price.toString(),
          available: t.totalSupply - t.sold,
        })),
        stake: e.stake ? {
          status: e.stake.status,
          amount: e.stake.amount.toString(),
          stakeTxHash: e.stake.stakeTxHash,
        } : null,
      })),
    })
  })

  app.get('/me/dashboard', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as any

    const organizer = await prisma.organizerProfile.findUnique({
      where: { userId: user.sub },
      include: {
        events: {
          where: { status: 'ACTIVE', deletedAt: null },
          include: { stake: true, ticketTiers: true },
        },
      },
    })

    if (!organizer) {
      return reply.status(403).send({ error: { code: 'NOT_ORGANIZER', message: 'Not an organizer' } })
    }

    const recentHistory = await prisma.reputationHistory.findMany({
      where: { organizerId: organizer.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    return reply.send({
      overview: {
        totalRevenue: organizer.totalRevenue.toString(),
        revenueAsset: 'XLM',
        activeEvents: organizer.events.length,
        totalAttendeesServed: organizer.totalAttendeesServed,
      },
      activeEvents: organizer.events.map((e) => ({
        id: e.id,
        title: e.title,
        slug: e.slug,
        startsAt: e.startsAt.toISOString(),
        ticketsSold: e.ticketsSold,
        totalTickets: e.totalTickets,
        revenue: e.totalRevenue.toString(),
        checkedIn: e.checkedInCount,
        stake: e.stake
          ? { status: e.stake.status, amount: e.stake.amount.toString(), releaseAfter: e.stake.releaseAfter?.toISOString() }
          : null,
      })),
      reputation: {
        score: organizer.reputationScore,
        tier: organizer.trustTier,
        recentHistory: recentHistory.map((h) => ({
          delta: h.delta,
          reason: h.reason,
          createdAt: h.createdAt.toISOString(),
        })),
      },
    })
  })

  app.get('/me/stakes', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as any
    const organizer = await prisma.organizerProfile.findUnique({ where: { userId: user.sub } })
    if (!organizer) return reply.status(403).send({ error: { code: 'NOT_ORGANIZER', message: 'Not an organizer' } })

    const stakes = await prisma.organizerStake.findMany({
      where: { organizerId: organizer.id },
      include: { event: { select: { title: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send({
      data: stakes.map((s) => ({
        id: s.id,
        event: s.event,
        amount: s.amount.toString(),
        asset: s.asset,
        status: s.status,
        stakedAt: s.stakedAt?.toISOString(),
        releaseAfter: s.releaseAfter?.toISOString(),
      })),
    })
  })
}
