# Steluma — Production Gaps

**Date:** 2026-06-05

---

## P1: Missing Marketplace Confirmation Flow

The marketplace buy creates a half-implemented flow — it returns a XDR but never settles the sale. No `POST /marketplace/:listingId/confirm-buy` endpoint exists. The DB state is never updated on purchase completion. This is a fundamental business logic gap.

**Status:** MUST FIX before any marketplace use

---

## P2: Real IPFS Upload Never Called During Minting

All ticket and badge NFTs are minted with `ipfs://QmPlaceholder/${id}` metadata URIs. The `ipfs.service.ts` has full Pinata integration implemented but it is never called from `ticket.service.ts` or `scanner.service.ts`. Every NFT on-chain points to non-existent metadata.

**Status:** MUST FIX for usable NFTs

---

## P3: Web Application has No Dockerfile

`docker-compose.yml` references `./apps/web/Dockerfile` which does not exist. Docker Compose deployment will fail at the web service.

**Status:** MUST FIX for deployment

---

## P4: Database Migrations Not Run on Container Start

The API Dockerfile CMD is:
```
CMD ["node", "dist/index.js"]
```

There is no `prisma migrate deploy` step. In a fresh deployment, the database schema won't exist and the API will crash immediately with connection/table-not-found errors.

**Status:** MUST FIX for deployment

---

## P5: No Background Job System (Stuck Mints, Expired Listings)

There is no cron job or background worker for:
- Retrying failed/stuck `CONFIRMING` tickets
- Expiring marketplace listings past `expiresAt`
- Cancelling `PENDING` tickets older than 30 minutes (abandoned purchases)
- Cleaning up expired auth nonces
- Extending Soroban persistent storage TTLs

These will accumulate over time and create data inconsistency and storage cost issues.

**Status:** HIGH — production systems accumulate corruption without this

---

## P6: No Transaction Recovery After Backend Restart

If the API crashes while processing an async mint, all in-flight `CONFIRMING` tickets will never become `ACTIVE`. The only recovery is per-ticket manual retry by the buyer. At scale, this creates unresolvable stuck states.

**Status:** HIGH

---

## P7: EventFactory `record_sale` Not Synced

The on-chain EventFactory tracks `tickets_sold` per event. The backend never calls `record_sale`. On-chain ticket inventory is always 0. This breaks any smart contract logic that depends on `tickets_sold` (e.g., a future Soroban contract that validates attendance based on on-chain ticket count).

**Status:** MEDIUM

---

## P8: No Webhook/Notification System for On-Chain Events

The Horizon poller is the only mechanism to react to blockchain events. If it falls behind (e.g., >100 events between polls), events are lost. There is no dead-letter queue, no retry backlog, no alerting.

**Status:** MEDIUM

---

## P9: Ticket Tier Sale Windows Not Enforced in Blockchain TX

The `saleStartsAt`/`saleEndsAt` validation is only in the API layer (`ticket.service.ts`). Nothing prevents a user from building the purchase transaction manually and submitting it directly to Horizon when sales are closed.

**Note:** This is architecturally inherent — the blockchain itself doesn't enforce sale timing. The mitigation is that the NFT mint is admin-controlled (admin key required), so even if a user submits a payment TX, the admin won't mint until the check passes. The DB-level guard is sufficient.

**Status:** INFORMATIONAL

---

## P10: No Graceful Frontend Degradation for Missing Contract IDs

If contract IDs are not set (empty string in env), the frontend proceeds through the staking/minting flow and fails silently or with cryptic errors. There are no "contracts not deployed" UI states.

**Status:** MEDIUM

---

## P11: Missing Tests

No test files exist anywhere in the codebase except the Soroban contract tests. There are no:
- API integration tests
- Frontend component tests
- QR validation tests
- Marketplace flow tests
- Socket.IO tests

**Status:** HIGH for production confidence

---

## P12: No CI/CD Pipeline

No `.github/workflows`, `Makefile`, or CI configuration exists. Every deployment is manual. No automated test gates.

**Status:** MEDIUM
