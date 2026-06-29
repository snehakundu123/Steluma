# Steluma — Security Report

**Date:** 2026-06-05

---

## 1. QR Code Replay Attack (CRITICAL)

### Vulnerability
QR tokens are permanently valid signed blobs with no expiry and no single-use nonce. The same QR code can be scanned infinitely — a screenshot lasts forever.

### Attack Scenario
1. Attendee A purchases a ticket and screenshots the QR code
2. Attendee A transfers the ticket on the marketplace
3. Attendee A still has the old QR screenshot
4. Attendee A presents the screenshot at the door and gets in
5. The new ticket owner also tries to check in — one will be ALREADY_CHECKED_IN

### Fix
- Add `issuedAt` + `expiresAt` (15-minute window) to QR payload
- Add a cryptographically random `nonce` to each QR generation
- Store used nonces in Redis with TTL = expiry window
- Before recording check-in, verify nonce not used AND timestamp not expired
- After first use, mark nonce as consumed in Redis atomically

---

## 2. Auth Middleware Revocation Bypass (CRITICAL)

### Vulnerability
`app.authenticate` calls `app.jwt.verify()` which only checks JWT signature and expiry. It does NOT consult the revocation store. After a user calls `DELETE /auth/logout`, their access token remains valid for up to 15 minutes.

### Attack Scenario
1. Malicious actor obtains an access token (XSS, token theft, network intercept)
2. Victim logs out, token is marked revoked in DB
3. Attacker continues using the stolen token for up to 15 minutes
4. Attacker can purchase tickets, access organizer dashboards, scan QR codes

### Fix
Replace `app.jwt.verify()` in the authenticate decorator with `AuthService.verifyAccessToken()` which also checks Redis for revocation.

---

## 3. Marketplace Double-Spend (CRITICAL)

### Vulnerability
The marketplace buy flow has no atomic state machine. Two buyers can simultaneously:
1. Both call `POST /marketplace/:listingId/buy` — both get the same XDR (no state change)
2. Both sign and submit their transactions on-chain
3. The first to confirm gets the on-chain NFT transfer
4. The second's payment goes through but no one refunds them — funds lost
5. Neither buyer has their DB state updated (no confirmation endpoint)

### Fix
- Before returning the buy XDR, atomically set listing status to `PENDING_SALE` with buyer info
- Add `POST /marketplace/:listingId/confirm-buy` endpoint that verifies the tx and updates DB
- Add 5-minute TTL on `PENDING_SALE` state with Redis lock — if not confirmed, revert to ACTIVE
- On confirmation, atomically update listing to SOLD, transfer ticket ownership in DB

---

## 4. Ticket Number Race Condition (CRITICAL)

### Vulnerability
Under concurrent load, two purchases for different ticket tiers of the same event will both read the same `maxTicketNumber` from the database and assign overlapping ticket numbers. The `@@unique([eventId, ticketNumber])` constraint will cause a DB error on the second write, leaving orphaned PENDING tickets that are never cleaned up.

### Fix
Use a PostgreSQL sequence or atomic `SELECT ... FOR UPDATE SKIP LOCKED` pattern. Simplest fix: use a DB-level serial counter per event, or acquire a Redis lock scoped per event (not per tier).

---

## 5. STELLAR_ADMIN_SECRET Exposure Risk (HIGH)

### Vulnerability
The admin private key is loaded from an environment variable at startup:
```typescript
export const adminKeypair = StellarSdk.Keypair.fromSecret(env.STELLAR_ADMIN_SECRET)
```

This key signs all contract invocations (mint, lock, slash). If the environment is compromised (leaked .env, Docker inspect, logs), an attacker gains full control to mint arbitrary NFTs and manipulate all contract state.

### Mitigations
- Never log `env.STELLAR_ADMIN_SECRET` (currently safe, but add explicit exclusion)
- Use Docker secrets or a vault service instead of env vars in production
- Rotate the admin key periodically and implement key rotation in the upgrade path
- Consider a multi-sig threshold for high-value operations (slash, mass mint)

---

## 6. JWT Secret Derivation for QR Signing (MEDIUM)

### Vulnerability
The QR signing key is derived from the JWT secret:
```typescript
const qrSigningKey = crypto.createHash('sha256')
  .update(`qr-signing-${env.JWT_SECRET}`)
  .digest()
```

If an attacker obtains `JWT_SECRET` (e.g., from a leaked `.env`), they can:
1. Forge valid JWT access tokens
2. Forge valid QR codes for arbitrary tickets
3. The same key compromise breaks both auth and check-in security

### Fix
Use a separate `QR_SIGNING_SECRET` environment variable distinct from `JWT_SECRET`.

---

## 7. Auth Nonce Stored in Both Redis and PostgreSQL (LOW)

The `createChallenge` function stores the nonce in both Redis (for fast lookup with TTL) and PostgreSQL (AuthNonce table). After successful auth, Redis is cleaned up but the PostgreSQL row is upserted, not deleted. Over time this table grows unboundedly and can be used to enumerate recent auth attempts.

### Fix
Delete the AuthNonce row on successful auth. Add a cleanup job for expired nonces.

---

## 8. Scanner Route: No Rate Limiting Per-Event (MEDIUM)

The `POST /scanner/validate` route is protected by auth (organizer only) but has no per-event rate limiting. A compromised organizer account or a bug in the scanner app could cause thousands of check-in attempts per minute, creating a denial-of-service on the check-in system.

### Fix
Add `rateLimit` plugin per-route with 30 req/minute per organizer wallet for the validate endpoint.

---

## 9. QR Token Stored in API Response Only (LOW)

The QR data URL and token are generated on-demand and never stored in the database (`qr_payload_hash` column exists but is never populated). This means:
- No audit trail of when QR codes were generated
- No ability to invalidate specific QR codes without ticket cancellation
- Cannot detect if the same QR was generated multiple times

### Fix
Hash the QR token and store it in `tickets.qr_payload_hash` when generated. Use this for faster lookup during scan validation.

---

## 10. CORS Wildcard in Development (INFORMATIONAL)

```typescript
origin: env.NODE_ENV === 'development' ? true : [env.FRONTEND_URL],
```

The `true` wildcard in development mode is acceptable for local development but should be documented. Ensure `NODE_ENV` cannot be `development` in any deployed environment.
