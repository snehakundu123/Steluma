# Steluma — Full Codebase Audit Report

**Date:** 2026-06-05  
**Auditor:** Senior Staff Engineer (Security, Blockchain, Fullstack, DevOps)  
**Scope:** Complete repository — contracts, backend API, frontend, infra, realtime

---

## Executive Summary

The platform has a solid architectural foundation. The Soroban contracts are reasonably well-written with basic access controls and overflow protections. The backend is structured correctly with Fastify + Prisma + Redis + Socket.IO. The frontend uses modern tooling (Next.js App Router, TanStack Query, Zustand).

**However, several critical vulnerabilities and production-breaking gaps were found that must be fixed before any real use:**

- QR codes have NO expiry and NO replay protection — a screenshot can check in indefinitely
- Auth middleware does not check token revocation — revoked tokens remain valid
- The marketplace buy flow is architecturally incomplete — purchases can never settle
- A race condition in ticket number assignment will cause constraint violations under concurrent load
- Socket.IO event names mismatch between backend and frontend (nothing in realtime works)
- IPFS metadata is always a placeholder — no NFT metadata is ever actually uploaded
- The Web Dockerfile is missing entirely

---

## Severity Ratings

| ID | Area | Issue | Severity |
|----|------|-------|----------|
| A-01 | QR Security | Static/deterministic QR, no expiry, no nonce | CRITICAL |
| A-02 | Auth | `authenticate` decorator bypasses revocation | CRITICAL |
| A-03 | Marketplace | Buy flow has no confirmation — sales never settle | CRITICAL |
| A-04 | Tickets | Ticket number race condition under concurrent load | CRITICAL |
| A-05 | Auth | Redis revocation key mismatch (set vs check) | HIGH |
| A-06 | Realtime | Socket.IO event name mismatch (all realtime broken) | HIGH |
| A-07 | Contracts | `record_sale` in EventFactory never called from backend | HIGH |
| A-08 | Marketplace | Horizon poller marks wrong listing as sold | HIGH |
| A-09 | NFT | IPFS metadata always placeholder, no real upload | HIGH |
| A-10 | DevOps | Web Dockerfile missing | HIGH |
| A-11 | DevOps | Dockerfile CMD does not run DB migrations | HIGH |
| A-12 | Contracts | No TTL extension on persistent storage (archival risk) | MEDIUM |
| A-13 | Staking | Release endpoint bypasses on-chain verification | MEDIUM |
| A-14 | Tickets | Ticket IDs are `purchaseId-i` strings, not UUIDs | MEDIUM |
| A-15 | DB | Missing indexes on qr_payload_hash, expiresAt | MEDIUM |
| A-16 | Realtime | `useRealtime` connects to default namespace, not event rooms | MEDIUM |
| A-17 | Backend | No cleanup job for expired listings / stale PENDING tickets | MEDIUM |
| A-18 | Contracts | `BadgeType` enum XDR encoding incorrect in scanner service | MEDIUM |
| A-19 | Frontend | No error boundary on ticket purchase flow | LOW |
| A-20 | Monitoring | `/health` endpoint doesn't check DB/Redis liveness | LOW |

---

## Detailed Findings

### A-01: Static/Deterministic QR Codes (CRITICAL)

**File:** `apps/api/src/services/qr.service.ts`

The `generateQrToken` function is explicitly documented as deterministic:
```typescript
// Token is fully deterministic — same ticket always produces the same QR
export function generateQrToken(ticketId, eventId, wallet)
```

The token contains no expiry timestamp, no single-use nonce, and is signed with a static key derived deterministically from JWT_SECRET. This means:
- A screenshot of any QR code is permanently valid
- An attendee who screenshots a friend's QR can check them both in
- Resold tickets retain the previous owner's QR code

### A-02: Auth Middleware Bypasses Revocation (CRITICAL)

**File:** `apps/api/src/index.ts` lines 46-53

The `authenticate` decorator uses `app.jwt.verify(token)` which only validates signature and expiry. It does NOT call `AuthService.verifyAccessToken()` which also checks Redis for revocation. Tokens remain valid after logout.

### A-03: Marketplace Buy Flow Incomplete (CRITICAL)

**File:** `apps/api/src/routes/marketplace.ts` lines 70-97

`POST /marketplace/:listingId/buy` returns a transaction XDR to sign but there is no `confirmBuy` endpoint. After the user signs and submits the transaction on-chain, nothing happens in the database. The listing stays ACTIVE forever, the ticket remains in LISTED status, and the buyer never receives ownership. The Horizon poller's `handleMarketplaceSale` finds the first ACTIVE listing (not the specific one), further corrupting state.

### A-04: Ticket Number Race Condition (CRITICAL)

**File:** `apps/api/src/services/ticket.service.ts` lines 80-105

The purchase lock is per `(eventId, tierId)` but ticket numbers are assigned globally per event:
```typescript
const lastTicket = await prisma.ticket.findFirst({
  where: { eventId },
  orderBy: { ticketNumber: 'desc' },
})
const startNumber = (lastTicket?.ticketNumber ?? 0) + 1
```

Two concurrent purchases for different tiers will both read the same `lastTicket`, assign the same `startNumber`, then both call `createMany`. The second one will fail with a unique constraint violation on `[eventId, ticketNumber]` and leave orphaned PENDING tickets.

### A-05: Redis Revocation Key Mismatch (HIGH)

**File:** `apps/api/src/services/auth.service.ts`

`revokeSession` deletes `KEYS.session(jti)` but `verifyAccessToken` checks for `KEYS.session('revoked:${jti}')`. These keys never match. Token revocation through the fast path (Redis) is completely non-functional.

### A-06: Socket.IO Event Names Mismatch (HIGH)

Backend emits: `ticket_sold`, `checkin`, `listing_created`  
Frontend listens for: `ticket:sold`, `checkin:complete`, `listing:created`

Additionally, `useRealtime` connects to the root namespace (no namespace path) but the backend organizes events into `/event`, `/organizer`, and `/marketplace` namespaces. No realtime events ever reach the frontend.

### A-07: EventFactory `record_sale` Never Called (HIGH)

The Soroban `EventFactory.record_sale` function tracks `tickets_sold` on-chain. The backend never calls it. On-chain ticket count is always 0. On-chain and off-chain state diverge immediately.

### A-08: Horizon Poller Marks Wrong Listing as Sold (HIGH)

**File:** `apps/api/src/services/horizon-poller.service.ts` line 171

```typescript
const listing = await prisma.marketplaceListing.findFirst({
  where: { status: 'ACTIVE' },  // ← finds ANY active listing, not the specific one
})
```

When a marketplace sale event is detected, the poller finds the first active listing in the database rather than the listing corresponding to the on-chain event. This will randomly corrupt marketplace state.

### A-09: IPFS Metadata Always Placeholder (HIGH)

**File:** `apps/api/src/services/ticket.service.ts` line 165

```typescript
const metadataUri = `ipfs://QmPlaceholder/${ticketId}`
```

The `buildTicketMetadata` and `buildBadgeMetadata` functions exist in `ipfs.service.ts` but are never called during minting. All NFTs point to non-existent IPFS content.

### A-10/A-11: Docker Issues (HIGH)

- `apps/web/Dockerfile` does not exist — `docker-compose.yml` references it
- `apps/api/Dockerfile` CMD does not run `prisma migrate deploy` before starting

### A-12: Soroban Persistent Storage TTL (MEDIUM)

All contracts use `env.storage().persistent()` without calling `extend_ttl()`. Persistent storage entries on Stellar have a minimum TTL (~1.5 years). For production systems, TTLs must be extended to prevent state archival. This needs TTL extension calls either in the backend poller or via a cron job.

### A-13: Staking Release Without Chain Verification (MEDIUM)

`POST /staking/:eventId/release` updates the DB to RELEASED without verifying the corresponding on-chain transaction succeeded. An organizer can claim stake release just by meeting the time condition, without the on-chain escrow contract actually releasing funds.

### A-14: Non-UUID Ticket IDs (MEDIUM)

Ticket IDs are created as `${purchaseId}-${i}`. The Prisma schema declares `@id @default(uuid())` but these IDs are set manually. They fail UUID format validation if any middleware validates them, and they create non-standard UUIDs that break referential lookups.

### A-15: Missing Database Indexes (MEDIUM)

- `tickets.qr_payload_hash` — needed for O(1) QR-to-ticket lookup
- `marketplace_listings.expiresAt` — needed for expiry cleanup query
- `auth_nonces.expiresAt` — needed for cleanup job

### A-16: useRealtime Wrong Namespace (MEDIUM)

`useRealtime` connects to `io(apiUrl)` — the root Socket.IO namespace. The backend registers all events on named namespaces (`/event`, `/organizer`, `/marketplace`). The hook never receives any events.

### A-17: No Cleanup Jobs (MEDIUM)

- Expired marketplace listings stay ACTIVE forever
- Stale PENDING tickets (user abandoned the purchase) are never cancelled
- Expired auth nonces stay in the database
- Sessions past their `expiresAt` are never deleted

### A-18: BadgeType XDR Encoding Bug (MEDIUM)

**File:** `apps/api/src/services/scanner.service.ts` lines 120-124

```typescript
const badgeTypeSymbol = badgeType === 'VIP' ? 'Vip'
  : badgeType === 'EARLY_BIRD' ? 'EarlyBird'
  : badgeType.charAt(0) + badgeType.slice(1).toLowerCase()

StellarSdk.xdr.ScVal.scvVec([
  StellarSdk.xdr.ScVal.scvSymbol(badgeTypeSymbol),
])
```

Soroban contracttype enums are NOT encoded as a Vec with a symbol. They are encoded as a Map with a single entry: `{"variant_name": Void}`. This encoding will fail all badge mints on-chain.
