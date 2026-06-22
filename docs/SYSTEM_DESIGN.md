# System Design — Steluma

---

## 1. Architecture Overview

Steluma is a **monorepo** organized into four layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                                │
│   Next.js App (SSR/CSR) + PWA Scanner + Freighter Wallet       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS / WSS
┌──────────────────────────▼──────────────────────────────────────┐
│                    API GATEWAY LAYER                            │
│           Express/Fastify + Socket.IO + Redis Cache             │
└────────┬──────────────────┬──────────────────┬──────────────────┘
         │                  │                  │
┌────────▼──────┐  ┌────────▼──────┐  ┌────────▼──────┐
│  PostgreSQL   │  │   Redis        │  │  IPFS Node    │
│  (Primary DB) │  │  (Cache/Queue) │  │  (Metadata)   │
└───────────────┘  └───────────────┘  └───────────────┘
         │
┌────────▼──────────────────────────────────────────────────────┐
│                  STELLAR / SOROBAN LAYER                       │
│  EventFactory | TicketNFT | Badge | Escrow | Marketplace       │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. Monorepo Structure

```
steluma/
├── apps/
│   ├── web/                    # Next.js 14+ frontend
│   │   ├── app/                # App Router pages
│   │   │   ├── (auth)/
│   │   │   ├── (public)/
│   │   │   │   ├── events/
│   │   │   │   ├── organizers/
│   │   │   │   └── marketplace/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── organizer/
│   │   │   │   └── user/
│   │   │   └── scanner/        # QR scanner PWA
│   │   ├── components/
│   │   │   ├── ui/             # shadcn/ui primitives
│   │   │   ├── events/
│   │   │   ├── tickets/
│   │   │   ├── dashboard/
│   │   │   └── marketplace/
│   │   ├── hooks/
│   │   ├── store/              # Zustand stores
│   │   ├── lib/
│   │   │   ├── stellar.ts      # Stellar SDK wrapper
│   │   │   ├── freighter.ts    # Wallet integration
│   │   │   └── socket.ts       # Socket.IO client
│   │   └── public/
│   │
│   └── api/                    # Node.js backend
│       ├── src/
│       │   ├── routes/
│       │   ├── controllers/
│       │   ├── services/
│       │   │   ├── stellar/    # Blockchain interaction
│       │   │   ├── ipfs/
│       │   │   ├── qr/
│       │   │   └── socket/
│       │   ├── middleware/
│       │   ├── models/         # Prisma models
│       │   └── jobs/           # Background workers
│       ├── prisma/
│       └── tests/
│
├── contracts/
│   ├── event-factory/          # Soroban: EventFactoryContract
│   ├── ticket-nft/             # Soroban: TicketNFTContract
│   ├── attendance-badge/       # Soroban: AttendanceBadgeContract
│   ├── staking/                # Soroban: EscrowStakingContract
│   └── marketplace/            # Soroban: MarketplaceContract
│
├── packages/
│   ├── ui/                     # Shared UI components
│   ├── types/                  # Shared TypeScript types
│   ├── config/                 # Shared configs (eslint, tsconfig)
│   └── sdk/                    # Steluma SDK for contract interaction
│
├── docs/
├── scripts/                    # Setup, deploy, seed scripts
├── docker/
├── .env.example
├── docker-compose.yml
├── turbo.json
└── package.json
```

---

## 3. Frontend Architecture

### 3.1 Next.js App Router Layout

```
app/
├── layout.tsx                  # Root layout (providers, fonts)
├── page.tsx                    # Landing page
├── (auth)/
│   ├── connect/page.tsx        # Wallet connection
│   └── profile-setup/page.tsx
├── (public)/
│   ├── events/
│   │   ├── page.tsx            # Event discovery feed
│   │   └── [slug]/page.tsx     # Event detail (SSR + ISR)
│   ├── organizers/
│   │   └── [address]/page.tsx  # Organizer public profile
│   └── marketplace/page.tsx    # Resale listings
├── (dashboard)/
│   ├── layout.tsx              # Dashboard shell (sidebar, nav)
│   ├── organizer/
│   │   ├── page.tsx            # Organizer overview
│   │   ├── create/page.tsx     # Create event wizard
│   │   ├── events/[id]/page.tsx
│   │   └── analytics/page.tsx
│   └── user/
│       ├── page.tsx            # User overview
│       ├── tickets/page.tsx
│       └── badges/page.tsx
└── scanner/
    └── [eventId]/page.tsx      # PWA QR scanner
```

### 3.2 State Management

**Zustand Stores:**

```typescript
// Auth store
interface AuthStore {
  wallet: string | null
  user: User | null
  isConnecting: boolean
  connect: () => Promise<void>
  disconnect: () => void
}

// Event store
interface EventStore {
  events: Event[]
  currentEvent: Event | null
  filters: EventFilters
  setFilters: (f: EventFilters) => void
}

// Dashboard store
interface DashboardStore {
  liveStats: LiveStats
  checkIns: CheckIn[]
  revenue: RevenueData
  updateLiveStats: (s: Partial<LiveStats>) => void
}
```

**React Query for server state:**
- Events, tickets, marketplace listings
- Auto-refetch on window focus
- Optimistic updates for purchases
- Stale-while-revalidate for discovery

### 3.3 Real-Time Client

```typescript
// lib/socket.ts
const socket = io(process.env.NEXT_PUBLIC_API_URL, {
  auth: { token: getAuthToken() },
  transports: ['websocket'],
  reconnection: true,
  reconnectionDelay: 1000,
})

// Namespace per concern
const eventSocket = io(`${BASE}/event/${eventId}`)
const dashboardSocket = io(`${BASE}/organizer/${address}`)
```

---

## 4. Backend Architecture

### 4.1 Service Layer Design

```
API Server (Fastify)
├── Auth Middleware (JWT + wallet sig)
├── Rate Limiter (Redis sliding window)
├── Request Validator (Zod schemas)
│
├── Routes
│   ├── /auth
│   ├── /events
│   ├── /tickets
│   ├── /organizers
│   ├── /marketplace
│   ├── /scanner
│   └── /webhooks (Stellar horizon events)
│
├── Services
│   ├── AuthService          — JWT, session, sig verify
│   ├── EventService         — CRUD, discovery, search
│   ├── TicketService        — Purchase, QR gen, validation
│   ├── StellarService       — Horizon API, contract calls
│   ├── IPFSService          — Upload, pin, retrieve
│   ├── QRService            — Generate, validate, rotate
│   ├── BadgeService         — Mint trigger, track
│   ├── ReputationService    — Score calc, tier updates
│   ├── MarketplaceService   — Listings, sales, royalties
│   └── SocketService        — Emit real-time events
│
└── Jobs (Bull queues via Redis)
    ├── stake-release-job    — Triggered 72h after event end
    ├── badge-mint-job       — Async badge minting after check-in
    ├── reputation-update-job — Nightly score recalculation
    └── analytics-job        — Hourly aggregate stats
```

### 4.2 Authentication Flow

```
Client                    API Server              Stellar Network
  │                           │                        │
  │──── POST /auth/challenge ─►│                        │
  │◄─── { nonce, expires } ───│                        │
  │                           │                        │
  │  [User signs nonce in     │                        │
  │   Freighter wallet]       │                        │
  │                           │                        │
  │─── POST /auth/verify ────►│                        │
  │    { wallet, signature,   │                        │
  │      nonce }              │──── verify sig ────────│
  │                           │◄─── account valid ─────│
  │◄── { accessToken,         │                        │
  │      refreshToken } ──────│                        │
```

### 4.3 Ticket Purchase Flow

```
Client          API         Redis        PostgreSQL     Stellar
  │              │             │               │            │
  │─POST /buy──►│             │               │            │
  │              │─lock slot──►│               │            │
  │              │◄─granted───│               │            │
  │              │─create pending──────────────►│            │
  │◄─tx params──│             │               │            │
  │              │             │               │            │
  │[sign+submit tx]           │               │            │
  │─────────────────────────────────────────────────────►│
  │              │             │               │            │
  │              │◄── horizon webhook ─────────────────────│
  │              │─mint NFT ──────────────────────────────►│
  │              │◄── NFT tx hash ─────────────────────────│
  │              │─update DB ──────────────────►│            │
  │              │─release lock─►│               │            │
  │              │─emit socket──────────────────────────────│
  │◄─ ticket ───│             │               │            │
```

---

## 5. Blockchain Architecture

### 5.1 Contract Interaction Pattern

The backend uses a **Stellar SDK service** that wraps all contract calls:

```typescript
class StellarService {
  private server: StellarSdk.Horizon.Server
  private sorobanRpc: StellarSdk.SorobanRpc.Server
  private backendKeypair: StellarSdk.Keypair

  async invokeContract(
    contractId: string,
    method: string,
    args: StellarSdk.xdr.ScVal[],
    fee: number = 100
  ): Promise<StellarSdk.SorobanRpc.GetTransactionResponse>

  async simulateTransaction(
    contractId: string,
    method: string,
    args: StellarSdk.xdr.ScVal[]
  ): Promise<StellarSdk.SorobanRpc.SimulateTransactionResponse>
}
```

### 5.2 Contract Addresses (Testnet)

All contract addresses stored in `.env` and `packages/config`:
```
STELLAR_NETWORK=testnet
EVENT_FACTORY_CONTRACT=C...
TICKET_NFT_CONTRACT=C...
ATTENDANCE_BADGE_CONTRACT=C...
STAKING_CONTRACT=C...
MARKETPLACE_CONTRACT=C...
```

### 5.3 Event Horizon Webhooks

Stellar Horizon doesn't support push webhooks natively, so we use a polling service:

```
HorizonPoller (runs every 5s)
├── Poll account transactions for contract accounts
├── Detect: NFT mint, stake deposit, marketplace sale
├── Update PostgreSQL state
└── Emit Socket.IO events
```

Future: Replace with Stellar Meridian when available.

---

## 6. Data Architecture

### 6.1 PostgreSQL — Source of Truth for Off-Chain State

Used for:
- User profiles and sessions
- Event metadata (mirrors blockchain state)
- Analytics and aggregations
- QR payload tracking
- Reputation scores

PostgreSQL is **not** the source of truth for ownership — that's on-chain. But it caches ownership for performance.

### 6.2 Redis Usage

| Purpose | Key Pattern | TTL |
|---------|------------|-----|
| Session store | `session:{jwt_jti}` | 7d |
| Auth nonce | `nonce:{wallet}` | 5min |
| Ticket lock | `lock:ticket:{event_id}:{tier_id}` | 30s |
| Rate limit | `ratelimit:{ip}:{route}` | 1min |
| QR nonce | `qr:nonce:{nonce}` | 60s |
| Event cache | `event:{slug}` | 60s |
| Leaderboard | `reputation:leaderboard` | 10min |

### 6.3 IPFS Storage

| Asset | Content | Pinned By |
|-------|---------|----------|
| Event banner | Image file | Pinata |
| Ticket metadata | JSON | Pinata |
| Badge metadata | JSON | Pinata |
| Organizer avatar | Image file | Pinata |

IPFS CIDs are stored in PostgreSQL for fast retrieval.

---

## 7. Security Architecture

### 7.1 API Security Layers

```
Request
  │
  ├─► Rate Limiter (Redis sliding window, 100 req/min per IP)
  ├─► Helmet (security headers)
  ├─► CORS (allowlist frontend origins)
  ├─► Input Validation (Zod schemas, reject malformed)
  ├─► Auth Middleware (JWT verify + wallet fingerprint)
  ├─► Route Handler
  └─► Response (sanitized, no internal stack traces in prod)
```

### 7.2 QR Security

**Threat Model:**

| Threat | Mitigation |
|--------|-----------|
| Screenshot/share QR | 30-second rotating QR with server-signed nonce |
| Replay attack | Nonce stored in Redis, single-use |
| Forged QR | ED25519 signature from backend private key |
| Double scan | Atomic Redis lock + DB transaction |
| Stolen ticket | Ownership verified on Stellar at scan time |
| Offline scanner | Pre-issued JWT with 5-min validity + batch sync |

### 7.3 Smart Contract Security

- All contract methods validate caller authorization
- Reentrancy guards on escrow contract
- Integer overflow protection (Rust native u128 checked math)
- Transfer restrictions enforced at contract level
- Soulbound enforcement: badge transfer always returns error

---

## 8. Caching Strategy

### 8.1 Frontend Caching

- **Event pages:** ISR with 60s revalidation (Next.js)
- **Discovery feed:** SWR with 30s stale time
- **User tickets:** React Query, refetch on focus
- **Live stats:** No cache, direct Socket.IO

### 8.2 API Caching

- **Event data:** Redis, 60s TTL, invalidated on update
- **Reputation scores:** Redis, 10min TTL
- **Leaderboard:** Redis sorted set, updated by job
- **Ticket availability:** Redis, invalidated on purchase

---

## 9. Deployment Architecture

### 9.1 Docker Services

```yaml
services:
  web:         # Next.js frontend (port 3000)
  api:         # Fastify backend (port 4000)
  postgres:    # PostgreSQL 15 (port 5432)
  redis:       # Redis 7 (port 6379)
  ipfs:        # IPFS node or proxy to Pinata
  horizon:     # Optional local Stellar Quickstart
```

### 9.2 Mainnet-Ready Considerations

- **Database:** Connection pooling via PgBouncer
- **API:** Horizontal scaling, stateless (sessions in Redis)
- **WebSocket:** Sticky sessions or Redis pub/sub adapter
- **Contracts:** Deployed to Stellar mainnet with admin multisig
- **Keys:** Backend keypair in HSM or KMS (AWS/GCP)
- **IPFS:** Pinata enterprise for guaranteed pinning
- **Monitoring:** OpenTelemetry traces, Prometheus metrics, Grafana

### 9.3 Environment Tiers

| Env | Stellar | Database | Notes |
|-----|---------|---------|-------|
| local | Quickstart | Docker Postgres | Seed scripts |
| testnet | Testnet | Managed Postgres | CI/CD target |
| mainnet | Mainnet | Production Postgres + PgBouncer | Real funds |

---

## 10. Performance Targets

| Endpoint | p50 | p95 | p99 |
|---------|-----|-----|-----|
| GET /events (feed) | 50ms | 150ms | 300ms |
| GET /events/:id | 30ms | 80ms | 150ms |
| POST /tickets/purchase | 200ms | 800ms | 2000ms |
| POST /scanner/validate | 50ms | 100ms | 200ms |
| WebSocket message | 10ms | 30ms | 50ms |

Stellar transaction confirmation: ~5s (testnet) / ~5s (mainnet)
NFT mint confirmation: included in purchase tx, async callback
