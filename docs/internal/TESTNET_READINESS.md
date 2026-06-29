# Steluma — Testnet Readiness Assessment

**Date:** 2026-06-05

---

## Summary

**Current Status: NOT READY — 6 blocking issues must be fixed first**

After all blockers are resolved, the platform will be testnet-ready with the following caveats noted.

---

## Blocking Issues (Must Fix)

| # | Issue | Blocking Reason |
|---|-------|-----------------|
| 1 | QR No Expiry/Nonce | Attendees can share QR screenshots — core feature broken |
| 2 | Auth Revocation Bypass | Logout doesn't work — security broken |
| 3 | Marketplace No Confirmation | Sales never settle — core feature broken |
| 4 | Ticket Number Race Condition | Concurrent purchases corrupt data |
| 5 | Socket Event Name Mismatch | Zero realtime updates — dashboards are dead |
| 6 | Missing Web Dockerfile | Cannot deploy the application |

---

## Smart Contracts

### EventFactoryContract ✅
- `create_event` validates time ranges and non-zero tickets ✓
- `record_sale` protects against oversell ✓
- `cancel_event` allows organizer or admin ✓
- Overflow protection with `checked_add` ✓

**Gap:** `record_sale` never called from backend — on-chain sold count always 0

### TicketNFTContract ✅
- Admin-only mint protects against unauthorized ticket creation ✓
- `transfer` validates ownership and lock status ✓
- `lock` is admin-only and prevents post-check-in transfers ✓
- Overflow protection ✓

**Gap:** BadgeType enum XDR encoding is wrong in the backend call

### AttendanceBadgeContract ✅
- Deduplication key `HasBadge(address, eventId, badgeType)` prevents duplicate badges ✓
- Admin-only mint ✓
- Overflow protection ✓

**Gap:** Enum encoding bug in backend invocation

### EscrowStakingContract ⚠️
- Slash protection (`slash_bps <= 10000`) ✓
- Dispute window (72h) ✓
- Overflow protection ✓

**Gap:** Staking flow uses Horizon payment, NOT this contract — completely bypassed

### MarketplaceContract ✅
- Royalty cap at 20% ✓
- Seller cannot buy own listing ✓
- Duplicate listing protection ✓
- Overflow protection ✓

**Gap:** Backend doesn't use this contract for marketplace buy

---

## Backend Readiness

| Component | Status | Notes |
|-----------|--------|-------|
| Fastify setup | ✅ | Helmet, CORS, rate limiting, JWT |
| Database schema | ✅ | Well-structured with proper indexes |
| Auth flow | ⚠️ | Revocation bypass must be fixed |
| QR service | ❌ | Static tokens, no expiry, no nonce |
| Ticket purchase | ⚠️ | Race condition on ticket numbers |
| Scanner service | ⚠️ | Atomic check-in OK, badge encoding bug |
| Staking routes | ⚠️ | Bypasses Soroban contract |
| Marketplace | ❌ | No confirmation endpoint |
| Horizon poller | ⚠️ | Incorrect listing correlation |
| Socket.IO | ❌ | Event names don't match frontend |
| IPFS uploads | ❌ | Placeholder URIs only |

---

## Frontend Readiness

| Component | Status | Notes |
|-----------|--------|-------|
| Wallet connect | ✅ | Freighter integration solid |
| Auth flow | ✅ | Challenge/verify/refresh complete |
| Event listing | ✅ | Discovery and filtering work |
| Ticket purchase | ✅ | Flow is complete |
| Event creation | ✅ | Staking + publish flow complete |
| Scanner page | ✅ | QR scanning UI exists |
| Realtime hook | ❌ | Wrong namespace, wrong event names |
| Marketplace | ⚠️ | Missing buy confirmation UI |
| Error states | ⚠️ | Some missing error boundaries |

---

## Infrastructure Readiness

| Component | Status | Notes |
|-----------|--------|-------|
| PostgreSQL (Docker) | ✅ | Healthchecks, persistent volume |
| Redis (Docker) | ✅ | Persistence, LRU, healthchecks |
| API Dockerfile | ⚠️ | Missing migration step |
| Web Dockerfile | ❌ | Missing entirely |
| docker-compose | ⚠️ | References missing web Dockerfile |
| Environment validation | ✅ | Zod schema in env.ts |
| Secrets in .env | ⚠️ | OK for testnet, need vault for mainnet |

---

## Testnet Deployment Checklist

After fixing all blocking issues:

- [ ] Deploy all 5 Soroban contracts to testnet
- [ ] Fund admin account with testnet XLM
- [ ] Set all CONTRACT_ID env vars
- [ ] Set STELLAR_ADMIN_SECRET (testnet keypair)
- [ ] Configure Pinata JWT for real IPFS uploads
- [ ] Run `docker-compose up` and verify all healthchecks pass
- [ ] Run `prisma migrate deploy` (now automatic in Dockerfile)
- [ ] Create test organizer account in Freighter (testnet)
- [ ] Fund test accounts via `friendbot.stellar.org`
- [ ] Create a test event through the UI
- [ ] Stake for the test event
- [ ] Purchase a test ticket
- [ ] Verify NFT appears with real metadata
- [ ] QR check-in test (verify nonce consumed, second scan fails)
- [ ] Verify badge NFT minted
- [ ] Test marketplace listing and purchase
- [ ] Verify realtime events appear in organizer dashboard
