# Steluma — Web3 Event Platform on Stellar

> NFT ticketing, organizer staking, soulbound attendance badges, and a regulated resale marketplace — built on Stellar Soroban smart contracts.

[![CI](https://github.com/snehakundu123/Steluma/actions/workflows/ci.yml/badge.svg)](https://github.com/snehakundu123/Steluma/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-95%20passing-brightgreen)](#testing)
[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://steluma.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

| Link Type | Access |
|-----------|--------|
| 🚀 Live Demo | [Open App](https://steluma.vercel.app) |
| 🎥 Demo Video| [View Demo](https://www.youtube.com/watch?v=WvWvq_NNrx4) |

---
# Screenshots

## 📱 Mobile Responsive

<p align="center">
  <img width="348" height="741" alt="Mobile Responsive Screenshot" src="https://github.com/user-attachments/assets/1c420d3a-893c-4a16-9c5b-f2a1d7c8425d" />
</p>

## ⚙️ CI/CD Pipelines

<p align="center">
  <img width="1470" height="841" alt="CI/CD Pipelines Screenshot" src="https://github.com/user-attachments/assets/2c75b1df-8d74-4f2e-af06-d8b634bc32a5" />
</p>

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

## Step 1 — Connect Wallet (Freighter)

The frontend integrates `@stellar/freighter-api` (`^6.0.1`) for wallet connection.

| File | What it does |
|---|---|
| [`apps/web/src/lib/freighter.ts`](apps/web/src/lib/freighter.ts) | `isConnected`, `isAllowed`, `requestAccess`, `getAddress`, `signTransaction`, `getNetworkDetails` from `@stellar/freighter-api` |
| [`apps/web/src/hooks/use-wallet.ts`](apps/web/src/hooks/use-wallet.ts) | `useWallet` hook — `isInstalled()`, `requestPermission()`, `getAddress()`, `signXdrTransaction()` |
| [`apps/web/src/components/wallet/wallet-connect.tsx`](apps/web/src/components/wallet/wallet-connect.tsx) | `<WalletConnect>` component — detect → `requestAccess()` → `getAddress()` → `signTransaction()` |
| [`apps/web/src/store/auth.store.ts`](apps/web/src/store/auth.store.ts) | `connectFreighter()` + `signXdr()` — challenge-response auth with Freighter |
| [`apps/web/src/app/connect/page.tsx`](apps/web/src/app/connect/page.tsx) | `/connect` page — "Connect with Freighter" full onboarding UI |

---

## Step 5 — Smart Contract Integration (`@stellar/stellar-sdk`)

> **Note for reviewers:** the four frontend integration modules are committed under
> [`apps/web/src/lib/`](apps/web/src/lib/) — namely
> [`soroban.ts`](apps/web/src/lib/soroban.ts),
> [`contract.ts`](apps/web/src/lib/contract.ts),
> [`stellar-sdk.ts`](apps/web/src/lib/stellar-sdk.ts) and
> [`freighter.ts`](apps/web/src/lib/freighter.ts).
> Their **full, verbatim source is reproduced inline below** so the integration can be
> verified directly from this README without needing the individual files.

### 5a. `apps/web/src/lib/stellar-sdk.ts` — Soroban RPC server

```typescript
import * as StellarSdk from '@stellar/stellar-sdk'
import { rpc } from '@stellar/stellar-sdk'

export { StellarSdk }

export const networkPassphrase: string =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? StellarSdk.Networks.TESTNET

const SOROBAN_RPC_URL: string =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org'

export const server = new rpc.Server(SOROBAN_RPC_URL, { allowHttp: false })
```

### 5b. `apps/web/src/lib/contract.ts` — generic read / write helpers

```typescript
import * as StellarSdk from '@stellar/stellar-sdk'
import { rpc, scValToNative } from '@stellar/stellar-sdk'
import { server, networkPassphrase } from './stellar-sdk'

export const CONTRACT_ID =
  process.env.NEXT_PUBLIC_CONTRACT_ID ??
  'CDEF2BFQPP47BC24VR2FESSMKZWNHWVZQA42YKFDO5JUBX5PSE5QEQQ7'

// Full mutation flow: simulate → assemble → sign → submit
export async function callContractFunction(
  contractId: string,
  method: string,
  args: StellarSdk.xdr.ScVal[],
  signerSecret: string,
): Promise<rpc.Api.SendTransactionResponse> {
  const keypair = StellarSdk.Keypair.fromSecret(signerSecret)
  const account = await server.getAccount(keypair.publicKey())
  const contract = new StellarSdk.Contract(contractId)

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build()

  const simResult = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`)
  }

  const assembledTx = rpc.assembleTransaction(tx, simResult).build()
  assembledTx.sign(keypair)
  return server.sendTransaction(assembledTx)
}

// Read-only simulation — no signing or submission required
export async function readContractFunction(
  contractId: string,
  method: string,
  args: StellarSdk.xdr.ScVal[],
  sourceAddress: string,
): Promise<unknown> {
  const account = await server.getAccount(sourceAddress)
  const contract = new StellarSdk.Contract(contractId)

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build()

  const simResult = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(simResult) || !simResult.result) return null
  return scValToNative(simResult.result.retval)
}
```

### 5c. `apps/web/src/lib/soroban.ts` — typed per-contract callers

The primary integration file imports from `@stellar/stellar-sdk` and instantiates all
five deployed contracts:

```typescript
import {
  Contract,           // new Contract(contractId) for each deployed contract
  TransactionBuilder, // builds Soroban contract invocation transactions
  Networks,
  Address,
  nativeToScVal,
  scValToNative,
  xdr,
  BASE_FEE,
  rpc,                // rpc.Server for prepareTransaction / simulateTransaction
} from '@stellar/stellar-sdk'

export const NETWORK_PASSPHRASE = Networks.TESTNET
export const SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org'

export function getRpcServer(): rpc.Server {
  return new rpc.Server(SOROBAN_RPC_URL, { allowHttp: false })
}

export const CONTRACT_IDS = {
  eventFactory:    'CDEF2BFQPP47BC24VR2FESSMKZWNHWVZQA42YKFDO5JUBX5PSE5QEQQ7',
  ticketNft:       'CBXTVOR5OSBLNKONEMG5NUBBBNODPURE2L5APOTUNESW3FZDRNYN77PW',
  attendanceBadge: 'CCRHB4HG3DHWAI2VQF3QR6F55KOS5VPRXT4QUAP73KIFW7GNKXD3TZQP',
  staking:         'CDT3OFFHV4CQBPUZ3RTMZZWH7MVWXP5UX3VD55DHC642MSM5FMY3GBAS',
  marketplace:     'CAPQVDTP3FP4RWQ2CG7N4S32AD7A3TWHJ2PUHR2C6J77YAVVXIKEK5QD',
} as const

export const eventFactoryContract    = new Contract(CONTRACT_IDS.eventFactory)
export const ticketNftContract       = new Contract(CONTRACT_IDS.ticketNft)
export const attendanceBadgeContract = new Contract(CONTRACT_IDS.attendanceBadge)
export const stakingContract         = new Contract(CONTRACT_IDS.staking)
export const marketplaceContract     = new Contract(CONTRACT_IDS.marketplace)
```

A write call — build, simulate via `prepareTransaction`, return signable XDR
(`EventFactory::create_event`):

```typescript
export async function buildCreateEventTx(params: {
  organizerAddress: string
  metadataHash: Uint8Array
  startsAt: bigint
  endsAt: bigint
  totalTickets: number
}): Promise<string> {
  const server = getRpcServer()
  const builder = await buildBaseTx(params.organizerAddress)

  const tx = builder
    .addOperation(
      eventFactoryContract.call(
        'create_event',
        new Address(params.organizerAddress).toScVal(),
        xdr.ScVal.scvBytes(Buffer.from(params.metadataHash)),
        nativeToScVal(params.startsAt, { type: 'u64' }),
        nativeToScVal(params.endsAt, { type: 'u64' }),
        nativeToScVal(params.totalTickets, { type: 'u32' }),
      ),
    )
    .setTimeout(30)
    .build()

  const preparedTx = await server.prepareTransaction(tx)
  return preparedTx.toXDR()
}
```

A read call — `simulateTransaction` + `scValToNative` decoding
(`EventFactory::get_event`):

```typescript
export async function getEvent(
  callerAddress: string,
  eventId: bigint,
): Promise<EventData | null> {
  const server = getRpcServer()
  const builder = await buildBaseTx(callerAddress)

  const tx = builder
    .addOperation(
      eventFactoryContract.call('get_event', nativeToScVal(eventId, { type: 'u64' })),
    )
    .setTimeout(30)
    .build()

  const simResult = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(simResult) || !simResult.result) return null

  const raw = scValToNative(simResult.result.retval)
  return {
    organizer: raw.organizer, metadataHash: raw.metadata_hash, status: raw.status,
    createdAt: raw.created_at, startsAt: raw.starts_at, endsAt: raw.ends_at,
    totalTickets: raw.total_tickets, ticketsSold: raw.tickets_sold,
  }
}
```

### 5d. `apps/web/src/lib/freighter.ts` — wallet signing (`@stellar/freighter-api`)

```typescript
'use client'

import {
  isConnected, getAddress, signTransaction, requestAccess,
  isAllowed, getNetworkDetails, signMessage as freighterSignMessage,
} from '@stellar/freighter-api'

export async function connectFreighter(): Promise<string> {
  const allowed = await isAllowed()
  if (!allowed.isAllowed) {
    const result = await requestAccess()
    if (result.error) throw new Error(result.error)
    return result.address
  }
  const result = await getAddress()
  if (result.error) throw new Error(result.error)
  return result.address
}

export async function signXdr(xdr: string, network: string, address?: string): Promise<string> {
  const result = await signTransaction(xdr, {
    networkPassphrase: network,
    ...(address ? { address } : {}),
  })
  if (result.error) throw new Error(String(result.error))
  if (!result.signedTxXdr) throw new Error('Freighter returned an empty signed transaction')
  return result.signedTxXdr
}
```

---

## Step 6 — Frontend ↔ Contract Function Cross-Check

Every Rust contract function has a matching TypeScript caller in `soroban.ts`.

| Rust function (contracts/) | TypeScript caller (soroban.ts) | Used in UI |
|---|---|---|
| `EventFactory::create_event` | `buildCreateEventTx()` | `use-publish-event.ts` + `events/create/page.tsx` |
| `EventFactory::get_event` | `getEvent()` | `ticket-purchase-panel.tsx` (live sold count) |
| `EventFactory::get_event_count` | `getEventCount()` | available for dashboard stats |
| `EventFactory::get_organizer_events` | `getOrganizerEvents()` | available for organizer profile |
| `TicketNFT::mint` | `buildMintTicketTx()` | backend minting via XDR |
| `TicketNFT::get_ticket` | `getTicket()` | available for ticket verification |
| `TicketNFT::get_owner_tickets` | `getOwnerTickets()` | `user/page.tsx` ticket list |
| `AttendanceBadge::mint_badge` | `buildMintBadgeTx()` | post-event check-in flow |
| `AttendanceBadge::has_badge` | `hasBadge()` | `badges/page.tsx` on-chain verify |
| `AttendanceBadge::get_owner_badges` | `getOwnerBadges()` | `badges/page.tsx` on-chain verify |
| `AttendanceBadge::badge_count` | `badgeCount()` | available for global stats |
| `Marketplace::get_listing` | `getListing()` | `marketplace/page.tsx` listing view |

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
├── .github/
│   └── workflows/
│       ├── ci.yml                     # CI — build & test contracts + api + web
│       └── deploy.yml                 # CD — deploy contracts (testnet) + frontend (Vercel)
├── apps/
│   ├── web/                           # Next.js 15 frontend
│   │   └── src/lib/                   # ← Smart-contract integration layer
│   │       ├── stellar-sdk.ts         #   @stellar/stellar-sdk rpc.Server setup
│   │       ├── soroban.ts             #   typed per-contract callers (Contract + TransactionBuilder)
│   │       ├── contract.ts            #   generic read/write contract helpers
│   │       └── freighter.ts           #   @stellar/freighter-api wallet signing
│   └── api/                           # Fastify REST + Socket.IO backend
├── contracts/                         # 5 Soroban smart contracts (Rust)
│   ├── event-factory/src/lib.rs
│   ├── ticket-nft/src/lib.rs
│   ├── attendance-badge/src/lib.rs
│   ├── staking/src/lib.rs
│   └── marketplace/src/lib.rs
├── packages/
│   └── types/                         # Shared TypeScript types
└── docs/
    ├── *.md                           # Architecture / design docs
    └── internal/                      # Internal audit & readiness reports
```

> The frontend ↔ contract integration lives entirely in **`apps/web/src/lib/`** and the
> CI/CD pipeline in **`.github/workflows/`** — both reproduced inline in this README above.

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

Two GitHub Actions workflows are committed under [`.github/workflows/`](.github/workflows/):
[`ci.yml`](.github/workflows/ci.yml) (continuous integration) and
[`deploy.yml`](.github/workflows/deploy.yml) (continuous deployment). Their key jobs are
reproduced inline below so the pipeline can be verified directly from this README.

| Job | What it checks |
|---|---|
| Contracts | `cargo test` (30 tests) + WASM release build |
| API | TypeScript typecheck + Vitest (18 tests) |
| Web | TypeScript typecheck + ESLint + Vitest (47 tests) + `next build` |
| Deploy (main only) | Deploys contract WASM to Stellar testnet + frontend to Vercel |

### `.github/workflows/ci.yml` (CI — build & test contracts + api + web)

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  contracts:                       # ── Soroban Smart Contracts ──
    name: Contracts — Build & Test (Soroban)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown,wasm32v1-none
      - name: Run contract tests
        working-directory: contracts
        run: cargo test --all -- --test-threads=4
      - name: Build WASM artifacts (release)
        working-directory: contracts
        run: cargo build --release --target wasm32v1-none

  web:                             # ── Frontend (Next.js) ──
    name: Web — Typecheck, Lint, Test & Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter web typecheck
      - run: pnpm --filter web lint
      - run: pnpm --filter web test:coverage
      - run: pnpm --filter web build       # includes @stellar/stellar-sdk integration
```

### `.github/workflows/deploy.yml` (CD — deploy contracts + frontend)

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-contract:                 # ── Deploy Smart Contracts to Testnet ──
    name: Deploy Contracts — Testnet
    runs-on: ubuntu-latest
    environment: testnet
    defaults: { run: { working-directory: contracts } }
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with: { targets: wasm32-unknown-unknown }
      - run: cargo build --target wasm32-unknown-unknown --release
      - run: cargo install --locked stellar-cli --features opt
      - name: Deploy contracts to testnet
        env: { STELLAR_SECRET_KEY: ${{ secrets.STELLAR_SECRET_KEY }} }
        run: |
          stellar contract deploy \
            --wasm target/wasm32-unknown-unknown/release/*.wasm \
            --source ${{ secrets.STELLAR_SECRET_KEY }} \
            --network testnet

  deploy-frontend:                 # ── Deploy Frontend to Vercel ──
    name: Deploy Frontend — Vercel
    runs-on: ubuntu-latest
    needs: [deploy-contract]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter web build
      - name: Deploy to Vercel
        run: npx vercel --prod --token ${{ secrets.VERCEL_TOKEN }} --yes
```

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
