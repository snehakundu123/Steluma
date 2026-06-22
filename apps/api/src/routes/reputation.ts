import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

const leaderboardSchema = z.object({
  trustTier: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
})

const ratingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  review: z.string().max(1000).optional(),
})

export async function reputationRoutes(app: FastifyInstance) {
  // Leaderboard
  app.get('/leaderboard', async (req, reply) => {
    const { trustTier, limit } = leaderboardSchema.parse(req.query)

    const where: any = {}
    if (trustTier) where.trustTier = trustTier

    const organizers = await prisma.organizerProfile.findMany({
      where,
      orderBy: { reputationScore: 'desc' },
      take: limit,
      include: { user: true },
    })

    const data = organizers.map((org, i) => ({
      rank: i + 1,
      organizer: {
        walletAddress: org.walletAddress,
        displayName: org.user.displayName,
        avatarUrl: org.user.avatarIpfsCid
          ? `${process.env.IPFS_GATEWAY ?? 'https://gateway.pinata.cloud/ipfs'}/${org.user.avatarIpfsCid}`
          : null,
        trustTier: org.trustTier,
        reputationScore: org.reputationScore,
        totalEventsHosted: org.totalEventsHosted,
        successfulEvents: org.successfulEvents,
        totalAttendeesServed: org.totalAttendeesServed,
        totalRevenue: org.totalRevenue.toString(),
        averageRating: Number(org.averageRating),
        ratingCount: org.ratingCount,
        verificationStatus: org.verificationStatus,
      },
    }))

    return reply.send({ data })
  })

  // Submit event rating (attendee only)
  app.post('/events/:eventId/rate', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { eventId } = req.params as { eventId: string }
    const user = req.user as any
    const { rating, review } = ratingSchema.parse(req.body)

    // Must have checked-in ticket for this event
    const checkIn = await prisma.checkIn.findFirst({
      where: { eventId, userId: user.sub },
    })
    if (!checkIn) {
      return reply.status(403).send({
        error: { code: 'NOT_ATTENDEE', message: 'You must have attended this event to rate it' },
      })
    }

    const existing = await prisma.eventRating.findUnique({
      where: { eventId_userId: { eventId, userId: user.sub } },
    })
    if (existing) {
      return reply.status(409).send({
        error: { code: 'ALREADY_RATED', message: 'You have already rated this event' },
      })
    }

    const eventRating = await prisma.eventRating.create({
      data: { eventId, userId: user.sub, rating, review },
    })

    // Update organizer average rating
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { organizer: true },
    })
    if (event) {
      const allRatings = await prisma.eventRating.findMany({
        where: { event: { organizerId: event.organizerId } },
        select: { rating: true },
      })
      const avg = allRatings.reduce((s, r) => s + r.rating, 0) / allRatings.length

      await prisma.organizerProfile.update({
        where: { id: event.organizerId },
        data: {
          averageRating: avg,
          ratingCount: allRatings.length,
        },
      })
    }

    return reply.status(201).send(eventRating)
  })

  // Get reputation history for organizer
  app.get('/organizers/:wallet/reputation', async (req, reply) => {
    const { wallet } = req.params as { wallet: string }

    const organizer = await prisma.organizerProfile.findUnique({
      where: { walletAddress: wallet },
      include: {
        reputationHistory: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    })
    if (!organizer) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Organizer not found' } })

    return reply.send({
      score: organizer.reputationScore,
      tier: organizer.trustTier,
      history: organizer.reputationHistory,
    })
  })
}
