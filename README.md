# Steluma — Web3 Event Platform on Stellar

> NFT ticketing, organizer staking, soulbound attendance badges, and a regulated resale marketplace — built on Stellar Soroban smart contracts.

[![CI](https://github.com/snehakundu123/Steluma/actions/workflows/ci.yml/badge.svg)](https://github.com/snehakundu123/Steluma/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-95%20passing-brightgreen)](#testing)
[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://steluma.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**Live:** https://steluma.vercel.app · **Repo:** https://github.com/snehakundu123/Steluma

---

## What it is

Steluma is a Luma/Eventbrite alternative where every ticket is a Soroban NFT, organizers stake XLM as collateral, and attendance is recorded as a permanent soulbound badge. All blockchain complexity is hidden from end users — they just see a fast, modern event-booking UI.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router), Tailwind CSS, Framer Motion |
| Backend | Fastify, Socket.IO, Prisma + PostgreSQL, Redis |
| Blockchain | Stellar Soroban (Rust), Freighter wallet |
| Infra | Docker Compose, Turborepo (pnpm workspaces), GitHub Actions CI/CD |
| Deploy | Vercel (frontend) |

---

## Smart Contracts — Testnet Deployment

Deployed on **Stellar Testnet** · Deployer: `GCDYD7RSB3ZP2HSO6WJWISIU7HZEDXFG6KVEGT7IWXLX2M6BKASQQZ3I`

| Contract | Address |
|---|---|
| EventFactory | `CDEF2BFQPP47BC24VR2FESSMKZWNHWVZQA42YKFDO5JUBX5PSE5QEQQ7` |
| TicketNFT | `CBXTVOR5OSBLNKONEMG5NUBBBNODPURE2L5APOTUNESW3FZDRNYN77PW` |
| AttendanceBadge | `CCRHB4HG3DHWAI2VQF3QR6F55KOS5VPRXT4QUAP73KIFW7GNKXD3TZQP` |
| Staking | `CDT3OFFHV4CQBPUZ3RTMZZWH7MVWXP5UX3VD55DHC642MSM5FMY3GBAS` |
| Marketplace | `CAPQVDTP3FP4RWQ2CG7N4S32AD7A3TWHJ2PUHR2C6J77YAVVXIKEK5QD` |

View on Stellar Expert: `https://stellar.expert/explorer/testnet/contract/<ADDRESS>`

---

## Stellar Wallet Integration (Freighter)

The frontend integrates `@stellar/freighter-api` for all on-chain interactions. Key files:

| File | What it does |
|---|---|
| [`apps/web/src/lib/freighter.ts`](apps/web/src/lib/freighter.ts) | Direct `@stellar/freighter-api` calls — `isConnected`, `isAllowed`, `requestAccess`, `getAddress`, `signTransaction`, `getNetworkDetails`, `signMessage` |
| [`apps/web/src/hooks/use-wallet.ts`](apps/web/src/hooks/use-wallet.ts) | `useWallet` hook — exposes `isInstalled()`, `requestPermission()`, `getAddress()`, `signXdrTransaction()` using `@stellar/freighter-api` |
| [`apps/web/src/components/wallet/wallet-connect.tsx`](apps/web/src/components/wallet/wallet-connect.tsx) | `<WalletConnect>` component — detect → permission → address → sign flow; re-exports `@stellar/freighter-api` functions |
| [`apps/web/src/store/auth.store.ts`](apps/web/src/store/auth.store.ts) | Auth store — `connectFreighter()` + `signXdr()` implement the full challenge-response auth |
| [`apps/web/src/app/connect/page.tsx`](apps/web/src/app/connect/page.tsx) | `/connect` page — "Connect with Freighter" UI with step-by-step onboarding |
| [`apps/web/src/components/events/ticket-purchase-panel.tsx`](apps/web/src/components/events/ticket-purchase-panel.tsx) | Ticket purchase — calls `signXdr()` to sign and submit Stellar transactions |

**Three mandatory criteria met:**
1. **Library import** — `@stellar/freighter-api@6.0.1` in `package.json`; imported in `freighter.ts`, `use-wallet.ts`, `wallet-connect.tsx`
2. **Connect Wallet UI** — `<WalletConnect>` in navbar; full onboarding at `/connect`; `requestAccess()` for permission request
3. **Address retrieval + transaction signing** — `getAddress()` returns the G-address; `signTransaction()` signs ticket purchase XDRs and auth challenge XDRs

---

## Key Features

- **Organizer Staking** — organizers lock XLM before publishing; stake is slashed on verified fraud
- **NFT Tickets** — lazy-minted Soroban NFTs; attendees own their tickets in their wallet
- **Fraud-Proof QR** — rotating ED25519-signed QR codes; screenshots are invalid
- **Soulbound Badges** — non-transferable attendance NFTs minted at check-in
- **Resale Marketplace** — capped resale price + automatic on-chain royalties to organizers
- **Real-time Updates** — Socket.IO streams ticket sales, check-ins, and notifications live

---

## Project Structure

```
steluma/
├── apps/
│   ├── web/          # Next.js 15 frontend
│   └── api/          # Fastify REST + Socket.IO backend
├── contracts/        # 5 Soroban smart contracts (Rust)
│   ├── event-factory/
│   ├── ticket-nft/
│   ├── attendance-badge/
│   ├── staking/
│   └── marketplace/
└── packages/
    └── types/        # Shared TypeScript types
```

---

## Quick Start

**Prerequisites:** Node.js 22+, pnpm 10+, Docker, Rust + `wasm32v1-none` target, Freighter wallet extension

```bash
git clone https://github.com/snehakundu123/Steluma.git
cd Steluma
cp .env.example .env          # fill in values
pnpm install
docker compose up -d          # postgres + redis
pnpm --filter api db:migrate
pnpm dev                      # runs web on :3000, api on :4000
```

---

## Environment Variables

```bash
# API
DATABASE_URL=postgresql://postgres:password@localhost:5432/steluma
REDIS_URL=redis://localhost:6379
JWT_SECRET=<min-32-char-secret>
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
STELLAR_ADMIN_SECRET=<your-stellar-secret-key>

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Testing

**95 tests** across three layers:

```bash
pnpm test                          # all workspaces
pnpm --filter web test             # 47 frontend utility tests (Vitest)
pnpm --filter api test             # 18 API tests (Vitest)
cd contracts && cargo test         # 30 Rust contract tests
```

Test coverage includes utility functions, API error classes, event domain logic, and all smart contract state transitions.

---

## CI/CD Pipeline

GitHub Actions runs on every push and PR to `main`:

| Job | What it checks |
|---|---|
| Contracts | `cargo test` (30 tests) + WASM release build |
| API | TypeScript typecheck + Vitest (18 tests) |
| Web | TypeScript typecheck + ESLint + Vitest (47 tests) + `next build` |
| Deploy (main only) | Deploys WASM artifacts to Stellar testnet |

Frontend deploys automatically to Vercel on push to `main`.

---

## Smart Contract Architecture

Each contract is an independent Soroban program using `#[contractevent]` typed events, `#[contracttype]` enums, persistent storage with TTL extensions, and `caller.require_auth()` on all state-mutating functions.

```
EventFactory  ──creates──▶  TicketNFT  ──locks──▶  AttendanceBadge
     │                          │
     └──registers──▶ Staking    └──lists──▶ Marketplace
```

Security properties:
- Overflow-safe arithmetic (`checked_add`, `checked_mul`)
- Inter-contract caller validation (`record_sale()` only from registered TicketNFT)
- Royalty cap enforced at contract level (≤ 20%)
- Soulbound badges: no `transfer()` function exists

---

## Deployment

**Contracts (Soroban testnet):**
```bash
bash scripts/deploy-contracts.sh
```

**Frontend (Vercel):**
```bash
vercel deploy --prod
```

**Full stack (Docker):**
```bash
docker compose up -d --build
```

---

## Security

- Challenge-response wallet auth (unsigned XDR signed by Freighter, never submitted)
- JWT access (15 min) + refresh (7 day) with Redis revocation
- QR nonces stored in Redis with 15-min TTL; first scan consumes the nonce
- Report vulnerabilities to sammodeb28@gmail.com

---

*Built on Stellar Soroban · Freighter · Next.js · Fastify*
