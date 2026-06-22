import crypto from 'crypto'
import QRCode from 'qrcode'
import nacl from 'tweetnacl'
import { env } from '../config/env.js'
import { redis, KEYS } from '../lib/redis.js'

// Use a SEPARATE secret for QR signing — never derive from JWT_SECRET
// Falls back to a derived key only if QR_SIGNING_SECRET is not configured (dev only)
const rawSecret =
  (env as any).QR_SIGNING_SECRET ??
  crypto.createHash('sha256').update(`qr-signing-${env.JWT_SECRET}`).digest('hex')

const qrSigningKey = crypto.createHash('sha256').update(rawSecret).digest()
const qrKeyPair = nacl.sign.keyPair.fromSeed(qrSigningKey)

// QR tokens expire after this window. Short enough to prevent screenshot reuse,
// long enough for the attendee to open their ticket screen at the venue.
const QR_TTL_SECONDS = 15 * 60 // 15 minutes

export interface QrPayload {
  ticketId: string
  eventId: string
  wallet: string
  nonce: string       // single-use random token
  issuedAt: number    // unix seconds
  expiresAt: number   // unix seconds
}

export interface QrValidationResult {
  valid: boolean
  reason?: string
  payload?: QrPayload
}

export function generateQrToken(ticketId: string, eventId: string, wallet: string): string {
  const nonce = crypto.randomBytes(16).toString('hex')
  const issuedAt = Math.floor(Date.now() / 1000)
  const expiresAt = issuedAt + QR_TTL_SECONDS

  const payload: QrPayload = { ticketId, eventId, wallet, nonce, issuedAt, expiresAt }
  const payloadJson = JSON.stringify(payload)
  const payloadBytes = Buffer.from(payloadJson, 'utf8')
  const signature = nacl.sign.detached(payloadBytes, qrKeyPair.secretKey)
  const sigHex = Buffer.from(signature).toString('hex')

  return Buffer.from(JSON.stringify({ payload: payloadJson, sig: sigHex })).toString('base64')
}

export async function generateQrCode(
  ticketId: string,
  eventId: string,
  wallet: string,
): Promise<{ token: string; qrDataUrl: string; expiresAt: number }> {
  const token = generateQrToken(ticketId, eventId, wallet)

  const qrDataUrl = await QRCode.toDataURL(token, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 300,
    color: { dark: '#000000', light: '#FFFFFF' },
  })

  // Parse the expiry from the token so the caller can display a countdown
  const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'))
  const payload: QrPayload = JSON.parse(decoded.payload)

  return { token, qrDataUrl, expiresAt: payload.expiresAt }
}

export async function validateQrToken(token: string): Promise<QrValidationResult> {
  // 1. Decode outer structure
  let tokenData: { payload: string; sig: string }
  try {
    tokenData = JSON.parse(Buffer.from(token, 'base64').toString('utf8'))
  } catch {
    return { valid: false, reason: 'INVALID_FORMAT' }
  }

  // 2. Parse inner payload
  let payload: QrPayload
  try {
    payload = JSON.parse(tokenData.payload)
  } catch {
    return { valid: false, reason: 'INVALID_PAYLOAD' }
  }

  if (!payload.ticketId || !payload.eventId || !payload.wallet || !payload.nonce || !payload.expiresAt) {
    return { valid: false, reason: 'INVALID_PAYLOAD' }
  }

  // 3. Check expiry BEFORE signature (fast path — avoids crypto on stale tokens)
  const nowSec = Math.floor(Date.now() / 1000)
  if (nowSec > payload.expiresAt) {
    return { valid: false, reason: 'EXPIRED_QR' }
  }

  // 4. Verify Ed25519 signature — forged or tampered tokens fail here
  const payloadBytes = Buffer.from(tokenData.payload, 'utf8')
  const sigBytes = Buffer.from(tokenData.sig, 'hex')
  const sigValid = nacl.sign.detached.verify(payloadBytes, sigBytes, qrKeyPair.publicKey)
  if (!sigValid) {
    return { valid: false, reason: 'INVALID_SIGNATURE' }
  }

  // 5. Anti-replay: check nonce has not been used
  const nonceKey = KEYS.qrNonce(payload.nonce)
  const alreadyUsed = await redis.exists(nonceKey)
  if (alreadyUsed) {
    return { valid: false, reason: 'NONCE_USED' }
  }

  // 6. Consume the nonce atomically with TTL matching token expiry
  // SET NX ensures exactly-once consumption even under concurrent scan attempts
  const remainingTtl = payload.expiresAt - nowSec + 60 // 60s buffer after expiry
  const consumed = await redis.set(nonceKey, '1', 'EX', remainingTtl, 'NX')
  if (!consumed) {
    // Another scan request consumed it in the tiny window between exists() and set()
    return { valid: false, reason: 'NONCE_USED' }
  }

  return { valid: true, payload }
}
