import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as ScannerService from '../services/scanner.service.js'
import { prisma } from '../lib/prisma.js'

const validateSchema = z.object({
  payload: z.string().min(1),
  eventId: z.string().uuid(),
  deviceInfo: z.string().optional(),
})

export async function scannerRoutes(app: FastifyInstance) {
  // Scanner header info — event meta + live check-in count (organizer only)
  app.get('/:eventId/info', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { eventId } = req.params as { eventId: string }
    const user = req.user as any

    const event = await prisma.event.findFirst({
      where: { id: eventId, organizer: { walletAddress: user.wallet } },
    })
    if (!event) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not event organizer' } })
    }

    const checkinCount = await prisma.checkIn.count({ where: { eventId } })

    return reply.send({
      id: event.id,
      title: event.title,
      slug: event.slug,
      ticketsSold: event.ticketsSold,
      totalTickets: event.totalTickets,
      checkinCount,
    })
  })

  app.post('/validate', {
    onRequest: [app.authenticate],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const user = req.user as any
    const { payload, eventId, deviceInfo } = validateSchema.parse(req.body)

    // Verify user is organizer of this event
    const event = await prisma.event.findFirst({
      where: { id: eventId, organizer: { walletAddress: user.wallet } },
    })
    if (!event) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not event organizer' } })
    }

    const result = await ScannerService.validateScan(payload, eventId, user.wallet, deviceInfo)

    if (!result.valid) {
      const code = result.reason ?? 'INVALID_TICKET'
      const messages: Record<string, string> = {
        ALREADY_CHECKED_IN: 'This ticket has already been checked in.',
        TICKET_NOT_FOUND: 'Ticket not found.',
        WRONG_EVENT: 'This QR code is for a different event.',
        OWNERSHIP_MISMATCH: 'Ticket ownership mismatch.',
        TICKET_CANCELLED: 'This ticket has been cancelled.',
        INVALID_FORMAT: 'Invalid QR code format.',
        INVALID_PAYLOAD: 'QR code payload is corrupted.',
        INVALID_SIGNATURE: 'QR code signature is invalid.',
        EXPIRED_QR: 'QR code has expired. Ask the attendee to refresh.',
        NONCE_USED: 'QR code has already been used.',
        INVALID_TICKET: 'Invalid ticket.',
      }
      return reply.status(400).send({
        error: {
          code,
          message: messages[code] ?? 'Verification failed.',
          attendeeName: (result as any).checkIn ? undefined : undefined,
        },
      })
    }

    return reply.send(result)
  })

  app.get('/checkins/:eventId', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { eventId } = req.params as { eventId: string }
    const user = req.user as any
    const { limit = 50, since } = req.query as { limit?: number; since?: string }

    const event = await prisma.event.findFirst({
      where: { id: eventId, organizer: { walletAddress: user.wallet } },
    })
    if (!event) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not event organizer' } })

    const where: any = { eventId }
    if (since) where.checkedInAt = { gt: new Date(since) }

    const [checkIns, total] = await Promise.all([
      prisma.checkIn.findMany({
        where,
        orderBy: { checkedInAt: 'desc' },
        take: Number(limit),
        include: {
          ticket: { include: { tier: true } },
          user: true,
        },
      }),
      prisma.checkIn.count({ where: { eventId } }),
    ])

    return reply.send({
      data: checkIns.map((ci) => ({
        id: ci.id,
        checkedInAt: ci.checkedInAt.toISOString(),
        ticket: {
          ticketNumber: ci.ticket.ticketNumber,
          tier: ci.ticket.tier.name,
        },
        attendee: {
          walletAddress: ci.user.walletAddress,
          displayName: ci.user.displayName,
        },
      })),
      stats: {
        totalCheckedIn: total,
        totalExpected: event.ticketsSold,
        checkInRate: event.ticketsSold > 0 ? ((total / event.ticketsSold) * 100).toFixed(1) : '0',
      },
    })
  })
}
