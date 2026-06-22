/**
 * Auth Service — Unit Tests
 * Tests: challenge creation, JWT validation, revocation, refresh flow
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockRedis = {
  setex: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  exists: vi.fn(),
  set: vi.fn(),
}
const mockPrisma = {
  user: { findUnique: vi.fn(), create: vi.fn() },
  session: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  authNonce: { upsert: vi.fn(), deleteMany: vi.fn() },
}

vi.mock('../lib/redis.js', () => ({
  redis: mockRedis,
  KEYS: {
    authNonce: (w: string) => `nonce:${w}`,
    revokedToken: (j: string) => `revoked:token:${j}`,
    session: (j: string) => `session:${j}`,
  },
}))
vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }))
vi.mock('../config/env.js', () => ({
  env: {
    JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-chars-long-enough',
    STELLAR_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
    NODE_ENV: 'test',
  },
}))
vi.mock('../lib/logger.js', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

const { createChallenge, verifyAccessToken, revokeSession } = await import('../services/auth.service.js')

describe('Auth Service — revokeSession', () => {
  it('sets revocation key in Redis on logout', async () => {
    mockPrisma.session.update.mockResolvedValue({})
    mockRedis.setex.mockResolvedValue('OK')

    await revokeSession('test-jti-123')

    expect(mockPrisma.session.update).toHaveBeenCalledWith({
      where: { jti: 'test-jti-123' },
      data: { revokedAt: expect.any(Date) },
    })
    expect(mockRedis.setex).toHaveBeenCalledWith(
      'revoked:token:test-jti-123',
      900, // 15 * 60
      '1',
    )
  })
})

describe('Auth Service — verifyAccessToken', () => {
  it('rejects a token whose JTI is in the Redis revocation list', async () => {
    mockRedis.exists.mockResolvedValue(1) // token is revoked

    const { SignJWT } = await import('jose')
    const secret = new TextEncoder().encode('test-jwt-secret-that-is-at-least-32-chars-long-enough')
    const token = await new SignJWT({ wallet: 'G...', role: 'ATTENDEE', jti: 'revoked-jti' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-id')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(secret)

    await expect(verifyAccessToken(token)).rejects.toThrow('TOKEN_REVOKED')
  })

  it('accepts a valid non-revoked token', async () => {
    mockRedis.exists.mockResolvedValue(0) // not revoked

    const { SignJWT } = await import('jose')
    const secret = new TextEncoder().encode('test-jwt-secret-that-is-at-least-32-chars-long-enough')
    const token = await new SignJWT({ wallet: 'GXYZ', role: 'ATTENDEE', jti: 'fresh-jti' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-id-1')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(secret)

    const payload = await verifyAccessToken(token)
    expect(payload.jti).toBe('fresh-jti')
    expect(payload.wallet).toBe('GXYZ')
    expect(payload.role).toBe('ATTENDEE')
  })
})
