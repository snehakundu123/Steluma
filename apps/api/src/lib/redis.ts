import Redis from 'ioredis'
import { env } from '../config/env.js'

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
})

redis.on('error', (err) => {
  console.error('[Redis] error:', err.message)
})

export const KEYS = {
  authNonce: (wallet: string) => `nonce:${wallet}`,
  session: (jti: string) => `session:${jti}`,
  revokedToken: (jti: string) => `revoked:token:${jti}`,
  ticketLock: (eventId: string, tierId: string) => `lock:ticket:${eventId}:${tierId}`,
  eventTicketLock: (eventId: string) => `lock:event:ticket:${eventId}`,
  qrNonce: (nonce: string) => `qr:nonce:${nonce}`,
  rateLimit: (ip: string, route: string) => `rl:${ip}:${route}`,
  eventCache: (slug: string) => `event:${slug}`,
  buyLock: (listingId: string) => `lock:buy:${listingId}`,
} as const
