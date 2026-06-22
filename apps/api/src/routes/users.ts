import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { env } from '../config/env.js'

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  avatarIpfsCid: z.string().optional(),
})

export async function userRoutes(app: FastifyInstance) {
  app.get('/me', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as any
    const profile = await prisma.user.findUnique({
      where: { id: user.sub },
      include: { organizerProfile: true },
    })
    if (!profile) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } })

    return reply.send({
      ...profile,
      avatarUrl: profile.avatarIpfsCid ? `${env.IPFS_GATEWAY}/${profile.avatarIpfsCid}` : null,
    })
  })

  app.patch('/me', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as any
    const data = updateProfileSchema.parse(req.body)
    const updated = await prisma.user.update({ where: { id: user.sub }, data })
    return reply.send(updated)
  })

  app.get('/me/tickets', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as any
    const { status, page = 1, limit = 20 } = req.query as { status?: string; page?: number; limit?: number }

    const where: any = { ownerId: user.sub }
    if (status) where.status = status

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          event: {
            select: {
              id: true, title: true, slug: true, startsAt: true,
              bannerUrl: true, locationType: true, locationCity: true,
            },
          },
          tier: { select: { name: true, perks: true } },
        },
      }),
      prisma.ticket.count({ where }),
    ])

    return reply.send({
      data: tickets.map((t) => ({
        ...t,
        onChainTokenId: t.onChainTokenId?.toString() ?? null,
        purchasePrice: t.purchasePrice.toString(),
      })),
      meta: { page: Number(page), limit: Number(limit), total, hasNextPage: (Number(page) - 1) * Number(limit) + tickets.length < total, hasPrevPage: Number(page) > 1 },
    })
  })

  app.get('/me/badges', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as any
    const badges = await prisma.attendanceBadge.findMany({
      where: { userId: user.sub },
      orderBy: { issuedAt: 'desc' },
      include: {
        event: { select: { id: true, title: true, startsAt: true } },
      },
    })

    return reply.send({
      data: badges.map((b) => ({
        ...b,
        metadataUri: b.metadataIpfsCid,
      })),
      meta: { total: badges.length },
    })
  })

  app.get('/me/notifications', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as any
    const { unreadOnly, page = 1, limit = 20 } = req.query as { unreadOnly?: string; page?: number; limit?: number }

    const where: any = { userId: user.sub }
    if (unreadOnly === 'true') where.isRead = false

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where: { userId: user.sub, isRead: false } }),
    ])

    return reply.send({ data: notifications, meta: { unreadCount } })
  })

  app.post('/me/notifications/read-all', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as any
    const result = await prisma.notification.updateMany({
      where: { userId: user.sub, isRead: false },
      data: { isRead: true, readAt: new Date() },
    })
    return reply.send({ markedRead: result.count })
  })
}
