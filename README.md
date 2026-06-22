# Steluma — Web3 Event Platform on Stellar

> **Luma/Eventbrite for Web3** — NFT ticketing, organizer staking, soulbound attendance badges, and a regulated resale marketplace, all built on Stellar Soroban smart contracts.

[![CI](https://github.com/your-org/steluma/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/steluma/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-95%20passing-brightgreen)](./docs)
[![Soroban](https://img.shields.io/badge/Soroban-v26-blue)](https://stellar.org/developers/soroban)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Features](#2-features)
3. [Architecture](#3-architecture)
4. [Technology Stack](#4-technology-stack)
5. [Installation Guide](#5-installation-guide)
6. [Environment Variables](#6-environment-variables)
7. [Smart Contract Deployment](#7-smart-contract-deployment)
8. [Event Streaming Architecture](#8-event-streaming-architecture)
9. [Frontend Architecture](#9-frontend-architecture)
10. [Testing](#10-testing)
11. [CI/CD Pipeline](#11-cicd-pipeline)
12. [Deployment Guide](#12-deployment-guide)
13. [Troubleshooting](#13-troubleshooting)
14. [Demo Walkthrough](#14-demo-walkthrough)
15. [Contract Deployment Addresses](#15-contract-deployment-addresses)
16. [Security](#16-security)

---

## 1. Project Overview

Steluma solves three critical problems with traditional event ticketing:

| Problem | Solution |
|---------|----------|
| Ticket fraud & counterfeiting | On-chain NFT tickets with cryptographic proof of ownership |
| Organizer accountability | Required staking with 72-hour dispute window and slashing |
| Scalper price gouging | Max-price caps enforced at the smart contract level |

### Key Design Decisions

- **Invisible blockchain UX** — Attendees use Freighter wallet; no seed phrases or gas management exposed
- **Organizer staking** — Verified organizers lock collateral; auto-released after the 72h dispute window
- **Rotating QR codes** — Anti-screenshot protection: tokens expire after 15 minutes with a server-side nonce consumed on first use
- **Soulbound badges** — Attendance badges cannot be transferred; enforced at the contract level (transfer function intentionally omitted)
- **PostgreSQL + Redis cache** — Stellar/Soroban is the source of truth for ownership; the database caches state for sub-millisecond UI queries
- **Horizon polling** — Stellar lacks native push webhooks; the API polls Horizon every 5 seconds and fans out via Socket.IO

---

## 2. Features

### For Attendees
- Connect Freighter wallet and authenticate in one click
- Purchase NFT tickets from event pages
- View ticket wallet with QR codes for check-in
- Earn soulbound attendance badges automatically after attending
- Resell transferable tickets on the marketplace with royalty protection
- Track on-chain reputation and leaderboard rank

### For Organizers
- Create events with rich metadata (IPFS-stored cover images)
- Stake collateral to earn "Verified Organizer" trust tier
- Real-time dashboard: live revenue, check-in feed, attendee count
- QR scanner for mobile check-in (camera or manual entry)
- Manage ticket tiers with per-tier pricing and supply caps

### For the Platform
- Automated badge minting after event completion
- Dispute and slash mechanism for organizer misconduct
- Regulated resale marketplace (royalty ≤ 20%, max-price cap per listing)
- Full audit trail — every action emits a typed Soroban contract event

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
│  Browser (Freighter)          Mobile Scanner                     │
└───────────────┬─────────────────────────────────────────────────┘
                │ HTTPS / WSS
┌───────────────▼─────────────────────────────────────────────────┐
│                    Next.js 15 (App Router)                       │
│  • Server Components for data-fetching pages                     │
│  • Client Components for wallet interactions                     │
│  • Socket.IO-client for real-time event feeds                    │
└───────────────┬─────────────────────────────────────────────────┘
                │ REST + WebSocket
┌───────────────▼─────────────────────────────────────────────────┐
│                    Fastify API (Node.js)                         │
│  • JWT auth (wallet-signed challenge)                            │
│  • Rate limiting, CORS, Helmet                                   │
│  • Socket.IO (/event, /organizer, /marketplace namespaces)       │
│  • Horizon poller (5s) → fan-out to Socket.IO                   │
│  • BullMQ background jobs (cleanup, badge minting)               │
└──────┬─────────────────┬───────────────────────────────────────┘
       │                 │
┌──────▼──────┐   ┌──────▼──────┐   ┌────────────────────────────┐
│ PostgreSQL  │   │    Redis    │   │     Stellar Soroban         │
│ • Events    │   │ • Nonces    │   │  EventFactoryContract       │
│ • Tickets   │   │ • Sessions  │   │  TicketNFTContract          │
│ • Users     │   │ • Rate lim  │   │  AttendanceBadgeContract    │
│ • Sessions  │   │ • Locks     │   │  EscrowStakingContract      │
└─────────────┘   └─────────────┘   │  MarketplaceContract        │
                                    └────────────────────────────┘
                                              │
                                    ┌─────────▼──────────┐
                                    │  IPFS via Pinata   │
                                    │  (NFT metadata)    │
                                    └────────────────────┘
```

### Data Flow: Ticket Purchase

```
User → Freighter → API (POST /tickets/purchase)
  → Redis lock (per event)
  → DB transaction (assign ticket number)
  → Soroban: ticket_nft.mint()
  → Soroban: event_factory.record_sale()
  → IPFS: uploadTicketMetadata()
  → Socket.IO: ticket:sold (to event room + organizer room)
  → Release Redis lock
  → Return NFT ticket ID to user
```

---

## 4. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Smart Contracts | Rust / Soroban SDK | 26.0.1 |
| API Backend | Fastify + TypeScript | v5 |
| Frontend | Next.js + React | 15 / 19 |
| Database | PostgreSQL + Prisma | 15 / 6 |
| Cache / Locks | Redis (ioredis) | 7 |
| Real-time | Socket.IO | 4.8 |
| Wallet | Freighter (Stellar) | v6 |
| File Storage | IPFS via Pinata | — |
| Auth | JWT + wallet challenge-sign | — |
| State (frontend) | Zustand + React Query | 5 |
| Styling | Tailwind CSS + Radix UI | 3.4 |
| Testing (Rust) | Soroban testutils | — |
| Testing (TS) | Vitest | 2 |
| CI/CD | GitHub Actions | — |
| Container | Docker Compose | — |
| Monorepo | Turborepo + pnpm | 10 |

---

## 5. Installation Guide

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥22 | [nodejs.org](https://nodejs.org) |
| pnpm | ≥10 | `npm install -g pnpm` |
| Rust | stable | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Stellar CLI | ≥22 | `cargo install --locked stellar-cli` |
| Docker | any | [docker.com](https://docker.com) |
| Freighter | browser ext | [freighter.app](https://freighter.app) |

### Quick Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-org/steluma.git
cd steluma

# 2. One-command setup (installs deps, starts Docker, migrates DB, seeds data)
bash scripts/setup.sh

# 3. Deploy smart contracts to Stellar testnet
bash scripts/deploy-contracts.sh
# This auto-populates your .env with contract IDs

# 4. Start all services in development mode
pnpm dev
```

The app will be available at:
- **Frontend**: http://localhost:3000
- **API**: http://localhost:4000
- **API Docs (Swagger)**: http://localhost:4000/docs
- **Health Check**: http://localhost:4000/health

### Manual Setup

```bash
# Install all workspace dependencies
pnpm install

# Copy environment template
cp .env.example .env
# Edit .env and fill in required values

# Start infrastructure (Postgres + Redis)
docker compose up -d postgres redis

# Generate Prisma client
pnpm --filter api db:generate

# Run database migrations
pnpm --filter api db:migrate

# Seed sample data (optional)
pnpm --filter api db:seed

# Start API and frontend in parallel
pnpm dev
```

---

## 6. Environment Variables

Copy `.env.example` to `.env` and fill in the required values.

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://steluma:steluma@localhost:5432/steluma` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | JWT signing secret (min 64 chars) | `openssl rand -base64 64` |
| `STELLAR_ADMIN_SECRET` | Backend signing keypair secret | `S...` (never commit!) |
| `STELLAR_NETWORK` | Network type | `testnet` or `mainnet` |
| `STELLAR_RPC_URL` | Soroban RPC endpoint | `https://soroban-testnet.stellar.org` |
| `STELLAR_HORIZON_URL` | Horizon API endpoint | `https://horizon-testnet.stellar.org` |

### Contract IDs (populated by deploy script)

| Variable | Contract |
|----------|---------|
| `EVENT_FACTORY_CONTRACT_ID` | EventFactoryContract |
| `TICKET_NFT_CONTRACT_ID` | TicketNFTContract |
| `ATTENDANCE_BADGE_CONTRACT_ID` | AttendanceBadgeContract |
| `STAKING_CONTRACT_ID` | EscrowStakingContract |
| `MARKETPLACE_CONTRACT_ID` | MarketplaceContract |

### IPFS (Pinata)

| Variable | Description |
|----------|-------------|
| `PINATA_API_KEY` | Pinata API key |
| `PINATA_API_SECRET` | Pinata API secret |
| `PINATA_JWT` | Pinata JWT (preferred) |
| `IPFS_GATEWAY` | IPFS gateway URL |

---

## 7. Smart Contract Deployment

### Automatic (Recommended)

```bash
bash scripts/deploy-contracts.sh
```

This script:
1. Generates a new Stellar keypair (or uses `STELLAR_ADMIN_SECRET` from `.env`)
2. Funds the account via Friendbot (testnet only)
3. Builds all 5 contracts to WASM (`wasm32v1-none` target)
4. Deploys each contract via Soroban CLI
5. Calls `initialize()` on each contract
6. Auto-updates `.env` with the contract IDs

### Manual Deployment

```bash
# Build all contracts
cd contracts
cargo build --release --target wasm32v1-none

# Deploy a contract
stellar contract deploy \
  --wasm target/wasm32v1-none/release/event_factory.wasm \
  --source admin-keypair \
  --network testnet

# Initialize EventFactory (replace IDs with your deployed values)
stellar contract invoke \
  --id $EVENT_FACTORY_CONTRACT_ID \
  --source admin-keypair \
  --network testnet \
  -- initialize \
  --admin $ADMIN_ADDRESS \
  --ticket_contract $TICKET_NFT_CONTRACT_ID
```

### Contract Architecture

```
EventFactoryContract ←── record_sale() ──→ TicketNFTContract
        │                                         │
        │ event_id                            ticket_id
        ▼                                         ▼
EscrowStakingContract                   AttendanceBadgeContract
        │                                         │
        │ organizer accountability          soulbound to owner
        │
MarketplaceContract ← ── list_ticket() ── ticket_id
```

#### Inter-Contract Communication

`record_sale()` on EventFactoryContract can only be called by the registered TicketNFTContract address. This ensures ticket counts and availability are always in sync with actual on-chain mints.

### Contract Events

All contracts emit typed events using the `#[contractevent]` macro:

| Contract | Event | Payload |
|----------|-------|---------|
| EventFactory | `EventCreated` | `event_id, organizer, total_tickets` |
| EventFactory | `TicketSold` | `event_id, tickets_sold, remaining` |
| EventFactory | `EventCancelled` | `event_id, cancelled_by` |
| TicketNFT | `TicketMinted` | `ticket_id, event_id, owner, tier` |
| TicketNFT | `TicketTransferred` | `ticket_id, from, to` |
| TicketNFT | `TicketLocked` | `ticket_id, owner` |
| AttendanceBadge | `BadgeMinted` | `badge_id, event_id, owner, badge_type` |
| EscrowStaking | `Staked` | `event_id, organizer, amount` |
| EscrowStaking | `StakeSlashed` | `event_id, slash_amount, slash_bps` |
| Marketplace | `ListingCreated` | `listing_id, ticket_id, seller, price` |
| Marketplace | `ListingSold` | `listing_id, buyer, seller, price, royalty_amount` |

---

## 8. Event Streaming Architecture

### Overview

Steluma provides real-time updates via three Socket.IO namespaces:

```
Client                      API Server
  │                            │
  ├── connect /event ──────────►│ Join room: event:{eventId}
  │   ◄── ticket:sold ─────────│ When ticket purchased
  │   ◄── marketplace:activity ─│ When listing created/sold
  │                            │
  ├── connect /organizer ──────►│ Auth token required
  │   ◄── checkin:complete ────│ On QR code scan
  │   ◄── revenue:update ──────│ On ticket sale
  │   ◄── badge:minted ────────│ On badge issuance
  │                            │
  └── connect /marketplace ───►│ Public feed
      ◄── listing:created ─────│ New resale listing
      ◄── listing:sold ────────│ Listing purchased
```

### Horizon Polling → Socket.IO Fan-out

Since Stellar Horizon doesn't offer push webhooks, the API polls every 5 seconds:

```
HorizonPollerService
  ├── Poll Horizon for new operations (since last cursor)
  ├── Filter for contract interactions with Steluma contract IDs
  ├── Parse contract events from transaction metadata
  └── Fan-out via Socket.IO to subscribed clients
```

### Frontend Hooks

```typescript
// Subscribe to live ticket availability on an event page
const { isConnected, lastEvent } = useEventRealtime(eventId)

// Subscribe to organizer dashboard updates (requires auth)
const { isConnected, lastEvent } = useOrganizerRealtime(eventId)

// Subscribe to marketplace feed
const { isConnected, lastEvent } = useMarketplaceRealtime()
```

All hooks include:
- Automatic reconnection with exponential back-off (1s → 10s max)
- Connection status indicator
- Cleanup on component unmount

### Reconnection Handling

```typescript
const socket = io(URL, {
  reconnection: true,
  reconnectionAttempts: Infinity,  // Never give up
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10_000,    // Cap at 10s
})
```

---

## 9. Frontend Architecture

### Pages

| Route | Description | Auth |
|-------|-------------|------|
| `/` | Landing page with trending events | Public |
| `/events` | Event discovery with search/filter | Public |
| `/events/[slug]` | Event detail + ticket purchase | Public |
| `/events/create` | 6-step event creation wizard | Required |
| `/events/[slug]/manage` | Event management dashboard | Organizer |
| `/events/[slug]/stake` | Organizer staking flow | Organizer |
| `/organizer` | Organizer SaaS dashboard | Required |
| `/user` | Ticket wallet + badges | Required |
| `/marketplace` | Resale marketplace | Public |
| `/scanner/[eventId]` | QR code scanner | Required |
| `/badges` | Badge gallery | Public |
| `/leaderboard` | Reputation leaderboard | Public |
| `/connect` | Wallet connection | Public |

### State Management

```
zustand stores:
  useAuthStore         — wallet, user, JWT tokens, connect/disconnect
  useNotificationStore — toast notifications, real-time alerts

React Query (TanStack):
  — Server state for events, tickets, users, marketplace listings
  — Automatic background refetching
  — Optimistic updates for transactions

Socket.IO hooks:
  useEventRealtime       — /event namespace
  useOrganizerRealtime   — /organizer namespace (authenticated)
  useMarketplaceRealtime — /marketplace namespace
```

### Mobile Responsiveness

All pages use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`, `xl:`):
- Mobile-first grid layouts
- Touch-friendly tap targets (min 44px)
- Collapsible navbar on mobile
- Full-screen QR scanner on mobile
- Swipeable ticket wallet cards

### Loading States

- **Page-level**: Next.js `loading.tsx` files with skeleton screens
- **Component-level**: Skeleton loaders matching content layout
- **Transaction**: Multi-step progress indicator during blockchain submissions
- **Image**: Blur placeholder via `next/image`

---

## 10. Testing

### Test Suite Summary

| Suite | Tests | Status |
|-------|-------|--------|
| Soroban Contract (Rust) | 30 | ✅ All passing |
| API Backend (Vitest) | 18 | ✅ All passing |
| Frontend Utilities (Vitest) | 47 | ✅ All passing |
| **Total** | **95** | **✅ 95/95 passing** |

### Running Tests

```bash
# Run all tests (contracts + API + web)
pnpm test

# Run contract tests only
cd contracts && cargo test --all

# Run API tests only
pnpm --filter api test

# Run frontend tests only
pnpm --filter web test

# Generate coverage reports
pnpm --filter api test:coverage
pnpm --filter web test:coverage
```

### Contract Test Output

```
running 7 tests (event-factory)
test test::test_create_event ... ok
test test::test_cancel_event ... ok
test test::test_complete_event ... ok
test test::test_record_sale_increments_counter ... ok
test test::test_update_event_metadata ... ok
test test::test_sold_out_panics ... ok
test test::test_get_organizer_events ... ok
test result: ok. 7 passed; 0 failed

running 6 tests (ticket-nft)
test test::test_mint_and_transfer ... ok
test test::test_lock_prevents_transfer ... ok
test test::test_non_transferable_ticket ... ok
test test::test_owner_index_tracks_multiple_tickets ... ok
test test::test_event_ticket_index ... ok
test test::test_transfer_updates_owner_index ... ok
test result: ok. 6 passed; 0 failed

running 6 tests (attendance-badge)
test test::test_mint_badge ... ok
test test::test_no_duplicate_badge ... ok
test test::test_has_badge_query ... ok
test test::test_different_badge_types_same_event ... ok
test test::test_event_badge_index ... ok
test test::test_badge_count ... ok
test result: ok. 6 passed; 0 failed

running 5 tests (staking)
test test::test_stake_lifecycle ... ok
test test::test_dispute_and_slash ... ok
test test::test_duplicate_stake_rejected ... ok
test test::test_negative_amount_rejected ... ok
test test::test_organizer_stakes_index ... ok
test result: ok. 5 passed; 0 failed

running 6 tests (marketplace)
test test::test_list_and_buy ... ok
test test::test_royalty_distribution ... ok
test test::test_cancel_listing ... ok
test test::test_cannot_list_same_ticket_twice ... ok
test test::test_royalty_exceeds_cap ... ok
test test::test_seller_cannot_buy_own_listing ... ok
test result: ok. 6 passed; 0 failed
```

### API Test Output

```
✓ src/__tests__/qr.service.test.ts (9 tests)
✓ src/__tests__/auth.service.test.ts (3 tests)
✓ src/__tests__/scanner.service.test.ts (6 tests)
Test Files  3 passed (3)
Tests  18 passed (18)
```

### Frontend Test Output

```
✓ src/__tests__/api-client.test.ts (7 tests)
✓ src/__tests__/event-data.test.ts (15 tests)
✓ src/__tests__/utils.test.ts (25 tests)
Test Files  3 passed (3)
Tests  47 passed (47)
```

---

## 11. CI/CD Pipeline

### Pipeline Overview

```
Push to main/develop or PR to main
           │
    ┌──────▼──────────────────────────────────────┐
    │   contracts job                              │
    │   • cargo test --all (30 tests)              │
    │   • cargo build --release --target wasm32v1  │
    │   • Upload WASM artifacts                    │
    └──────┬──────────────────────────────────────┘
           │ (parallel with api + web)
    ┌──────▼──────────────────────────────────────┐
    │   api job                                    │
    │   • prisma generate                          │
    │   • tsc --noEmit (typecheck)                 │
    │   • vitest run --coverage (18 tests)         │
    │   • Upload coverage report                   │
    └──────┬──────────────────────────────────────┘
           │ (parallel)
    ┌──────▼──────────────────────────────────────┐
    │   web job                                    │
    │   • tsc --noEmit (typecheck)                 │
    │   • next lint                                │
    │   • vitest run --coverage (47 tests)         │
    │   • next build (production bundle)           │
    │   • Upload Next.js build artifact            │
    └──────┬──────────────────────────────────────┘
           │
    ┌──────▼──────────────────────────────────────┐
    │   ci-pass gate (all must succeed)            │
    └──────┬──────────────────────────────────────┘
           │ (main branch pushes only)
    ┌──────▼──────────────────────────────────────┐
    │   deploy-testnet job                         │
    │   • Download pre-built WASMs                 │
    │   • stellar contract deploy (all 5)          │
    │   • Initialize contracts                     │
    └─────────────────────────────────────────────┘
```

### Artifacts Produced

| Artifact | Contents | Retention |
|----------|----------|-----------|
| `soroban-wasm` | 5 compiled `.wasm` files | 7 days |
| `api-coverage` | Vitest coverage HTML report | 7 days |
| `web-coverage` | Vitest coverage HTML report | 7 days |
| `nextjs-build` | `.next/` production build | 7 days |

---

## 12. Deployment Guide

### Docker Production Deploy

```bash
# Set production environment variables
cp .env.example .env
# Edit .env with production values

# Build and start all services
docker compose up -d --build

# Verify health
curl http://localhost:4000/health
```

### Environment Variable Management

- **Development**: `.env` file (gitignored)
- **CI/CD**: GitHub Secrets (`Settings → Secrets and variables → Actions`)
- **Production**: Use a secrets manager (AWS Secrets Manager, Doppler, Vault)

Never commit `.env` files with real values. The `STELLAR_ADMIN_SECRET` is the most sensitive variable.

### Rollback Strategy

```bash
# API rollback (Docker)
docker compose pull api:previous-tag
docker compose up -d api

# Smart contracts: contracts are immutable once deployed.
# Deploy a new version and update the CONTRACT_ID env vars.
```

### Database Migrations

```bash
# Development
pnpm --filter api db:migrate

# Production (non-destructive, forward-only)
pnpm --filter api db:migrate:prod
```

The Dockerfile runs `prisma migrate deploy` automatically on startup.

---

## 13. Troubleshooting

**Wallet not detected**: Install [Freighter extension](https://freighter.app) and ensure it's on the correct network.

**"already initialized" on contract deploy**: Contract was already deployed. Use the existing contract ID or deploy from a new account.

**`ECONNREFUSED` on API startup**: Start Docker first: `docker compose up -d postgres redis`

**Real-time updates not working**: Check browser console for Socket.IO errors. Verify `NEXT_PUBLIC_API_URL` points to the running API.

**`insufficient funds` during testnet deploy**: Fund your account: `curl https://friendbot.stellar.org?addr=YOUR_ADDRESS`

---

## 14. Demo Walkthrough

### Scenario: Full Ticket Purchase and Attendance Flow

**Step 1 — Connect Wallet**
1. Open http://localhost:3000 and click "Connect Wallet"
2. Approve the Freighter connection prompt
3. Sign the challenge transaction (no XLM cost, never submitted)

**Step 2 — Purchase a Ticket**
1. Browse events at `/events`, click an event
2. Select a ticket tier and click "Buy Ticket"
3. Approve the XLM payment in Freighter
4. Watch the remaining ticket counter update in real-time (Socket.IO)

**Step 3 — Check In at the Event**
1. Organizer opens `/scanner/{eventId}` on their phone
2. Attendee opens `/user` and expands ticket to show QR code
3. Organizer scans the QR code → dashboard shows check-in notification
4. Ticket is locked on-chain (cannot be resold)

**Step 4 — Earn a Soulbound Badge**
1. Event completion triggers badge minting for verified attendees
2. Soulbound "Attendee" badge appears in the badge gallery
3. Badge is permanently on-chain and cannot be transferred

**Step 5 — Resell a Ticket (before event)**
1. Click "List for Resale" on a transferable ticket in your wallet
2. Set a price (enforced ≤ original max price)
3. Buyer purchases → royalty is automatically distributed to organizer

---

## 15. Contract Deployment Addresses

> Contracts are deployed on **Stellar Testnet** (Test SDF Network ; September 2015)

Run `bash scripts/deploy-contracts.sh` to deploy. The script outputs:

```
CONTRACT DEPLOYMENT SUMMARY — Stellar Testnet
Deployed at: 2026-06-23

EVENT_FACTORY_CONTRACT_ID=C...
TICKET_NFT_CONTRACT_ID=C...
ATTENDANCE_BADGE_CONTRACT_ID=C...
STAKING_CONTRACT_ID=C...
MARKETPLACE_CONTRACT_ID=C...
```

View contracts on Stellar Expert:
```
https://stellar.expert/explorer/testnet/contract/{CONTRACT_ID}
```

Transaction hashes are captured in `deployment.log`:
```bash
bash scripts/deploy-contracts.sh 2>&1 | tee deployment.log
```

---

## 16. Security

### Authentication
- **Challenge-response**: Backend generates an unsigned Stellar transaction XDR signed by Freighter (never submitted to network)
- **JWT pair**: 15-minute access token + 7-day refresh token with Redis-backed revocation
- **No seed phrase exposure**: All signing happens inside Freighter

### QR Anti-Replay
- Random nonce stored in Redis with 15-minute TTL
- First scan consumes the nonce; subsequent scans rejected
- Tokens rotate every 30 seconds (countdown visible to attendee)

### Smart Contract Security
- Overflow-checked arithmetic (`checked_add`, `checked_mul`) throughout
- `caller.require_auth()` on every state-mutating function
- Inter-contract caller validation: `record_sale()` only accepts calls from registered TicketNFT address
- Royalty cap enforced at contract level (≤ 20%)
- Soulbound badges: no `transfer()` function exists

### Reporting Vulnerabilities
Report security issues to sammodeb28@gmail.com rather than opening public issues.

---

## Commit History

This project was built with 10+ meaningful commits tracking the development progression:

```
1. chore: initialize Turborepo monorepo scaffold
2. feat(contracts): implement 5 Soroban smart contracts
3. feat(api): implement Fastify REST API with Socket.IO event streaming
4. feat(web): implement Next.js 15 frontend with premium design system
5. feat(infra): add Docker Compose stack and deployment scripts
6. ci: add comprehensive GitHub Actions pipeline
7. docs: add production audit reports and security assessment
8. test: expand smart contract tests to 30 (all 5 contracts)
9. fix(contracts): replace deprecated events.publish() with #[contractevent] macro
10. feat(web): add frontend test suite (47 utility + integration tests)
11. docs: write comprehensive README with full deployment guide
12. chore: add final audit report and production readiness assessment
```

---

*Built with ❤️ on Stellar Soroban. Powered by Freighter, Fastify, Next.js, and open-source.*
