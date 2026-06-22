import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import { Server as SocketServer } from 'socket.io'
import { env } from './config/env.js'
import { redis } from './lib/redis.js'
import { prisma } from './lib/prisma.js'
import { logger } from './lib/logger.js'
import { authRoutes } from './routes/auth.js'
import { eventRoutes } from './routes/events.js'
import { ticketRoutes } from './routes/tickets.js'
import { userRoutes } from './routes/users.js'
import { organizerRoutes } from './routes/organizers.js'
import { scannerRoutes } from './routes/scanner.js'
import { marketplaceRoutes } from './routes/marketplace.js'
import { stakingRoutes } from './routes/staking.js'
import { uploadRoutes } from './routes/upload.js'
import { reputationRoutes } from './routes/reputation.js'
import { startHorizonPoller } from './services/horizon-poller.service.js'
import { setIo } from './services/socket.service.js'
import { startCleanupJob } from './services/cleanup.service.js'
import { verifyAccessToken } from './services/auth.service.js'

export let io: SocketServer

async function buildApp() {
  const app = Fastify({ logger: false, trustProxy: true })

  await app.register(helmet, { crossOriginResourcePolicy: { policy: 'cross-origin' } })

  await app.register(cors, {
    // In dev, reflect any origin (Next.js dev server may pick any available port).
    // In production, restrict to the configured FRONTEND_URL.
    origin: env.NODE_ENV === 'development' ? true : [env.FRONTEND_URL],
    credentials: true,
  })

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    redis,
    keyGenerator: (req) => req.ip,
  })

  await app.register(jwt, { secret: env.JWT_SECRET })

  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } })

  // Auth decorator — uses verifyAccessToken which checks Redis revocation list,
  // not just JWT signature. This ensures logout actually invalidates tokens.
  app.decorate('authenticate', async (req: any, reply: any) => {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } })
    try {
      req.user = await verifyAccessToken(token)
    } catch (err: any) {
      const code = err.message === 'TOKEN_REVOKED' ? 'TOKEN_REVOKED' : 'UNAUTHORIZED'
      return reply.status(401).send({ error: { code, message: 'Invalid or expired token' } })
    }
  })

  // Error handler
  app.setErrorHandler((error: any, req, reply) => {
    if (error.validation) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request' } })
    }
    if (error.name === 'ZodError') {
      // Surface the first validation issue so the user sees the actual problem
      const firstIssue = error.issues?.[0]
      const message = firstIssue?.message ?? 'Invalid request body'
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message } })
    }
    logger.error('[API] unhandled error', { path: req.url, error: error.message })
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  })

  const V1 = '/api/v1'
  await app.register(authRoutes, { prefix: `${V1}/auth` })
  await app.register(eventRoutes, { prefix: `${V1}/events` })
  await app.register(ticketRoutes, { prefix: `${V1}/tickets` })
  await app.register(userRoutes, { prefix: `${V1}/users` })
  await app.register(organizerRoutes, { prefix: `${V1}/organizers` })
  await app.register(scannerRoutes, { prefix: `${V1}/scanner` })
  await app.register(marketplaceRoutes, { prefix: `${V1}/marketplace` })
  await app.register(stakingRoutes, { prefix: `${V1}/staking` })
  await app.register(uploadRoutes, { prefix: `${V1}/upload` })
  await app.register(reputationRoutes, { prefix: `${V1}/reputation` })

  app.get('/health', async (_req, reply) => {
    const checks: Record<string, string> = {}
    try { await prisma.$queryRaw`SELECT 1`; checks.db = 'ok' } catch { checks.db = 'error' }
    try { await redis.ping(); checks.redis = 'ok' } catch { checks.redis = 'error' }
    const healthy = Object.values(checks).every((s) => s === 'ok')
    return reply.status(healthy ? 200 : 503).send({
      status: healthy ? 'ok' : 'degraded',
      checks,
      ts: new Date().toISOString(),
      env: env.NODE_ENV,
    })
  })

  // Public platform stats for landing page
  app.get('/stats', async (_req, reply) => {
    const [events, tickets, badges, organizers] = await Promise.all([
      prisma.event.count({ where: { status: { in: ['ACTIVE', 'COMPLETED'] } } }),
      prisma.ticket.count({ where: { status: { not: 'CANCELLED' } } }),
      prisma.attendanceBadge.count({ where: { mintStatus: 'MINTED' } }),
      prisma.organizerProfile.count(),
    ])
    return reply.send({ events, tickets, badges, organizers })
  })

  return app
}

async function main() {
  const app = await buildApp()

  // Attach Socket.IO directly to Fastify's underlying HTTP server (not a new wrapper)
  io = new SocketServer(app.server, {
    cors: { origin: [env.FRONTEND_URL, 'http://localhost:3000'], credentials: true },
    transports: ['websocket', 'polling'],
  })

  const eventNs = io.of('/event')
  eventNs.on('connection', (socket: any) => {
    const { eventId } = socket.handshake.query as { eventId?: string }
    if (eventId) socket.join(`event:${eventId}`)
  })

  const organizerNs = io.of('/organizer')
  organizerNs.use((socket: any, next: any) => {
    const token = socket.handshake.auth?.token
    if (!token) return next(new Error('unauthorized'))
    try {
      socket.data.user = app.jwt.verify(token)
      next()
    } catch {
      next(new Error('unauthorized'))
    }
  })
  organizerNs.on('connection', (socket: any) => {
    const { eventId } = socket.handshake.query as { eventId?: string }
    if (eventId) socket.join(`organizer:${eventId}`)
  })

  const marketplaceNs = io.of('/marketplace')
  marketplaceNs.on('connection', (socket: any) => socket.join('marketplace'))

  // Register io globally for service-layer emissions
  setIo(io)

  try {
    await redis.connect()
    logger.info('[Redis] connected')
  } catch {
    logger.warn('[Redis] already connected or failed — continuing')
  }

  await prisma.$connect()
  logger.info('[DB] connected')

  // Start Stellar Horizon polling for contract events
  startHorizonPoller().catch((err) => logger.error('[Poller] Failed to start', { err }))
  // Start background cleanup job (expired listings, stale PENDING tickets, old nonces)
  startCleanupJob()

  await app.listen({ port: env.API_PORT, host: env.API_HOST })
  logger.info(`[API] http://localhost:${env.API_PORT}`)
  logger.info(`[Socket.IO] ready on same port`)
  logger.info(`[Stellar] network=${env.STELLAR_NETWORK}`)

  process.on('SIGTERM', async () => {
    logger.info('[Shutdown] SIGTERM received')
    await prisma.$disconnect()
    redis.disconnect()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('[Fatal]', err)
  process.exit(1)
})
