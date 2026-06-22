import crypto from 'crypto'
import * as StellarSdk from '@stellar/stellar-sdk'
import { SignJWT, jwtVerify } from 'jose'
import { prisma } from '../lib/prisma.js'
import { redis, KEYS } from '../lib/redis.js'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'

const ACCESS_EXPIRY = '15m'
const REFRESH_EXPIRY = '7d'
const NONCE_TTL = 5 * 60 // 5 minutes

const jwtSecret = new TextEncoder().encode(env.JWT_SECRET)

export interface JwtPayload {
  sub: string
  wallet: string
  role: string
  jti: string
}

export async function createChallenge(walletAddress: string): Promise<{
  nonce: string
  expiresAt: Date
  xdr: string
  networkPassphrase: string
}> {
  const nonce = `steluma-auth-${crypto.randomBytes(16).toString('hex')}`
  const expiresAt = new Date(Date.now() + NONCE_TTL * 1000)

  await redis.setex(KEYS.authNonce(walletAddress), NONCE_TTL, nonce)

  await prisma.authNonce.upsert({
    where: { walletAddress },
    create: { walletAddress, nonce, expiresAt },
    update: { nonce, expiresAt },
  })

  // Build a challenge transaction the wallet must sign.
  // Source = walletAddress with fake seq=0 (tx seq becomes 1).
  // This transaction is NEVER submitted — it only proves wallet ownership.
  const account = new StellarSdk.Account(walletAddress, '0')
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: env.STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(
      StellarSdk.Operation.manageData({
        name: 'steluma_auth',
        value: Buffer.from(nonce),
      }),
    )
    .setTimeout(NONCE_TTL)
    .build()

  return {
    nonce,
    expiresAt,
    xdr: tx.toXDR(),
    networkPassphrase: env.STELLAR_NETWORK_PASSPHRASE,
  }
}

export async function verifySignature(
  walletAddress: string,
  signedXdr: string,
  nonce: string,
  ipAddress?: string,
): Promise<{ accessToken: string; refreshToken: string; isNewUser: boolean }> {
  const storedNonce = await redis.get(KEYS.authNonce(walletAddress))
  if (!storedNonce || storedNonce !== nonce) {
    throw new Error('NONCE_INVALID')
  }

  try {
    const tx = new StellarSdk.Transaction(signedXdr, env.STELLAR_NETWORK_PASSPHRASE)
    const keypair = StellarSdk.Keypair.fromPublicKey(walletAddress)
    const txHash = tx.hash()
    const signed = tx.signatures.some((s) => {
      try { return keypair.verify(txHash, s.signature()) } catch { return false }
    })
    if (!signed) throw new Error('INVALID_SIGNATURE')
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'INVALID_SIGNATURE') throw err
    throw new Error('INVALID_SIGNATURE')
  }

  await redis.del(KEYS.authNonce(walletAddress))

  let user = await prisma.user.findUnique({ where: { walletAddress } })
  const isNewUser = !user

  if (!user) {
    user = await prisma.user.create({
      data: { walletAddress, role: 'ATTENDEE' },
    })
    logger.info('[Auth] new user created', { wallet: walletAddress })
  }

  const jti = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await prisma.session.create({
    data: { userId: user.id, jti, walletAddress, expiresAt, ipAddress },
  })

  const accessToken = await new SignJWT({ wallet: walletAddress, role: user.role, jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(ACCESS_EXPIRY)
    .sign(jwtSecret)

  const refreshToken = await new SignJWT({ jti, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(REFRESH_EXPIRY)
    .sign(jwtSecret)

  return { accessToken, refreshToken, isNewUser }
}

export async function refreshTokens(refreshToken: string): Promise<{ accessToken: string }> {
  const { payload } = await jwtVerify(refreshToken, jwtSecret).catch(() => {
    throw new Error('INVALID_REFRESH_TOKEN')
  })

  if ((payload as Record<string, unknown>).type !== 'refresh') {
    throw new Error('INVALID_REFRESH_TOKEN')
  }

  const userId = payload.sub!
  const jti = (payload as Record<string, unknown>).jti as string

  const session = await prisma.session.findUnique({ where: { jti } })
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new Error('SESSION_EXPIRED')
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('USER_NOT_FOUND')

  const accessToken = await new SignJWT({ wallet: user.walletAddress, role: user.role, jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(ACCESS_EXPIRY)
    .sign(jwtSecret)

  return { accessToken }
}

export async function revokeSession(jti: string): Promise<void> {
  await prisma.session.update({
    where: { jti },
    data: { revokedAt: new Date() },
  })
  // Mark the token as revoked in Redis so the authenticate middleware can fast-check.
  // TTL matches the access token max life so the key auto-cleans.
  await redis.setex(KEYS.revokedToken(jti), 15 * 60, '1')
}

export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, jwtSecret).catch(() => {
    throw new Error('INVALID_TOKEN')
  })

  const jti = (payload as Record<string, unknown>).jti as string
  // Check Redis revocation list — populated by revokeSession on logout
  const revoked = await redis.exists(KEYS.revokedToken(jti))
  if (revoked) throw new Error('TOKEN_REVOKED')

  return {
    sub: payload.sub!,
    wallet: (payload as Record<string, unknown>).wallet as string,
    role: (payload as Record<string, unknown>).role as string,
    jti,
  }
}
