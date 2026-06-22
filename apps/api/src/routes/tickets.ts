import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as TicketService from '../services/ticket.service.js'
import { prisma } from '../lib/prisma.js'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'

const purchaseSchema = z.object({
  eventId: z.string().uuid(),
  tierId: z.string().uuid(),
  quantity: z.number().int().min(1).max(10),
  buyerWallet: z.string().regex(/^G[A-Z2-7]{55}$/),
})

const confirmSchema = z.object({
  txHash: z.string().min(1),
})

export async function ticketRoutes(app: FastifyInstance) {
  app.post('/purchase', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as any
    const data = purchaseSchema.parse(req.body)

    try {
      const result = await TicketService.initiatePurchase(
        user.sub,
        data.eventId,
        data.tierId,
        data.quantity,
        data.buyerWallet,
      )
      return reply.send(result)
    } catch (err: any) {
      const statusMap: Record<string, number> = {
        TICKET_SOLD_OUT: 409,
        MAX_PER_WALLET_EXCEEDED: 409,
        SALE_NOT_STARTED: 400,
        SALE_ENDED: 400,
        PURCHASE_IN_PROGRESS: 429,
      }
      const status = statusMap[err.message] ?? 400
      return reply.status(status).send({ error: { code: err.message, message: err.message } })
    }
  })

  app.post('/purchase/:purchaseId/confirm', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { purchaseId } = req.params as { purchaseId: string }
    const { txHash } = confirmSchema.parse(req.body)
    const user = req.user as any

    const result = await TicketService.confirmPurchase(purchaseId, txHash, user.wallet)
    return reply.send(result)
  })

  app.get('/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        event: true,
        tier: true,
        owner: true,
        checkIn: true,
        marketplaceListings: { where: { status: 'ACTIVE' }, take: 1 },
      },
    })

    if (!ticket) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Ticket not found' } })
    // Serialize BigInt fields (Prisma returns bigint for on_chain_token_id)
    return reply.send({
      ...ticket,
      onChainTokenId: ticket.onChainTokenId?.toString() ?? null,
      purchasePrice: ticket.purchasePrice.toString(),
      event: ticket.event ? {
        ...ticket.event,
        totalRevenue: ticket.event.totalRevenue?.toString(),
        onChainEventId: ticket.event.onChainEventId?.toString() ?? null,
      } : undefined,
    })
  })

  app.get('/:id/qr', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = req.user as any

    try {
      const qr = await TicketService.getTicketQr(id, user.sub)
      return reply.send(qr)
    } catch (err: any) {
      return reply.status(404).send({ error: { code: 'TICKET_NOT_FOUND', message: 'Ticket not found or not active' } })
    }
  })

  // Retry minting for a stuck CONFIRMING ticket
  app.post('/:id/retry-mint', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = req.user as any

    const ticket = await prisma.ticket.findFirst({
      where: { id, ownerId: user.sub, status: 'CONFIRMING' },
      include: { event: true, tier: true },
    })
    if (!ticket) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'CONFIRMING ticket not found' } })

    TicketService.retryMint(ticket).catch((err: any) => logger.error('[Ticket] retry-mint failed', { err }))
    return reply.send({ status: 'RETRYING', ticketId: id })
  })
}
