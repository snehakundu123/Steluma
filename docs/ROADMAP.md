# Implementation Roadmap — Steluma

> Phase-by-phase build plan from scaffold to mainnet-ready

---

## Phase Overview

| Phase | Name | Duration | Deliverable |
|-------|------|---------|------------|
| 0 | Foundation & Scaffold | Week 1 | Monorepo, tooling, env |
| 1 | Auth + Core Backend | Week 2 | Auth, DB, basic API |
| 2 | Smart Contracts | Week 3–4 | All 5 Soroban contracts |
| 3 | Event System | Week 5–6 | Create, discover, manage events |
| 4 | NFT Ticketing | Week 7–8 | Purchase flow, ownership |
| 5 | QR Check-In | Week 9 | Scanner, validation, anti-fraud |
| 6 | Attendance Badges | Week 10 | Soulbound badge minting |
| 7 | Organizer Staking | Week 11 | Escrow, lifecycle, release |
| 8 | Reputation System | Week 12 | Score engine, trust tiers |
| 9 | Resale Marketplace | Week 13–14 | Listings, royalties, transfers |
| 10 | Real-Time & Dashboards | Week 15–16 | Socket.IO, live analytics |
| 11 | Polish & Security | Week 17–18 | Audit, performance, UX |
| 12 | Testnet Launch | Week 19–20 | Full integration, launch prep |

---

## Phase 0 — Foundation & Scaffold

**Goal:** Everything boots, lints, and has a clear structure.

### Tasks

- [ ] Initialize Turborepo monorepo
  - `turbo.json` with build/dev/lint/test pipelines
  - `pnpm-workspace.yaml`
  - Root `package.json` with workspaces
- [ ] Set up `apps/web` — Next.js 14 with App Router
  - TypeScript strict mode
  - TailwindCSS + shadcn/ui init
  - Framer Motion
  - ESLint + Prettier + Husky
- [ ] Set up `apps/api` — Fastify + TypeScript
  - Zod for validation
  - Prisma ORM
  - Winston logging
  - Jest + Supertest for testing
- [ ] Set up `contracts/` — Soroban Rust workspace
  - Cargo workspace
  - soroban-sdk dependency
  - Shared test utilities
- [ ] Set up `packages/`
  - `types`: shared TypeScript interfaces
  - `config`: ESLint, TypeScript base configs
  - `sdk`: stub for contract interaction
- [ ] Docker Compose
  - PostgreSQL, Redis, IPFS (Pinata proxy)
  - Volumes and healthchecks
- [ ] Environment setup
  - `.env.example` with all variables documented
  - Env validation with `@t3-oss/env-nextjs`
- [ ] CI/CD skeleton
  - GitHub Actions: lint, type-check, test
- [ ] `scripts/setup.sh` — one-command local setup
- [ ] Stellar testnet setup guide in `docs/`

### Acceptance Criteria
- `pnpm dev` starts web + api
- `docker-compose up` starts all infrastructure
- `pnpm build` succeeds for all packages
- `pnpm lint` passes clean

---

## Phase 1 — Authentication + Core Backend

**Goal:** Wallet authentication works end-to-end.

### Tasks

#### Backend
- [ ] Database schema: `users`, `sessions`, `organizer_profiles`
- [ ] Prisma migrations
- [ ] `POST /auth/challenge` — issue nonce
- [ ] `POST /auth/verify` — verify Stellar wallet signature
- [ ] `POST /auth/refresh` — refresh JWT
- [ ] `DELETE /auth/logout` — invalidate session
- [ ] Auth middleware (JWT + wallet fingerprint)
- [ ] Rate limiting middleware (Redis)
- [ ] Request logging middleware
- [ ] Health check endpoint

#### Frontend
- [ ] Freighter wallet detection hook
- [ ] Connect wallet modal component
- [ ] Auth store (Zustand)
- [ ] Protected route HOC / middleware
- [ ] Session persistence (localStorage + API sync)
- [ ] Wallet disconnect handler
- [ ] Auto-reconnect on page load

#### Infrastructure
- [ ] Redis session store
- [ ] JWT access + refresh token flow
- [ ] Wallet signature verification utility

### Acceptance Criteria
- User connects Freighter → gets JWT
- Wallet disconnect → session invalidated
- Protected routes redirect unauthenticated users
- Token refresh works transparently

---

## Phase 2 — Smart Contracts

**Goal:** All 5 Soroban contracts deployed to testnet.

### 2.1 EventFactoryContract

- [ ] `create_event(params)` — register event on-chain
- [ ] `update_event(event_id, params)` — update metadata hash
- [ ] `cancel_event(event_id)` — mark cancelled
- [ ] `get_event(event_id)` — read event data
- [ ] Events: `EventCreated`, `EventUpdated`, `EventCancelled`
- [ ] Tests: unit + integration on testnet

### 2.2 TicketNFTContract

- [ ] SEP-0041 token interface implementation
- [ ] `mint(to, event_id, tier, ticket_id, metadata_uri)` — lazy mint
- [ ] `transfer(from, to, ticket_id)` — ownership transfer
- [ ] `lock(ticket_id)` — prevent transfer after check-in
- [ ] `get_owner(ticket_id)` — ownership query
- [ ] `is_locked(ticket_id)` — locked status
- [ ] Transfer restriction enforcement
- [ ] Events: `Minted`, `Transferred`, `Locked`
- [ ] Tests: mint, transfer, lock scenarios

### 2.3 AttendanceBadgeContract

- [ ] `mint_badge(to, event_id, badge_type, metadata_uri)` — soulbound mint
- [ ] `get_badge(badge_id)` — badge data
- [ ] `get_badges_by_owner(address)` — all badges
- [ ] Transfer always returns error (soulbound enforcement)
- [ ] Events: `BadgeMinted`
- [ ] Tests: mint + verify non-transferable

### 2.4 EscrowStakingContract

- [ ] `stake(event_id, amount, asset)` — lock funds
- [ ] `release(event_id)` — return stake to organizer
- [ ] `slash(event_id, percentage, recipient)` — partial slash
- [ ] `get_stake(event_id)` — stake info
- [ ] `is_slashable(event_id)` — dispute window check
- [ ] Events: `Staked`, `Released`, `Slashed`
- [ ] Reentrancy guard
- [ ] Tests: stake lifecycle, slash scenarios

### 2.5 MarketplaceContract

- [ ] `list_ticket(ticket_id, price, asset)` — create listing
- [ ] `buy_ticket(listing_id, buyer)` — purchase + transfer
- [ ] `cancel_listing(listing_id)` — remove listing
- [ ] `get_listing(listing_id)` — listing info
- [ ] Royalty calculation + distribution
- [ ] Max resale price enforcement
- [ ] Events: `Listed`, `Sold`, `Cancelled`
- [ ] Tests: list, buy, cancel, royalty distribution

### Deployment
- [ ] Deploy all contracts to Stellar testnet
- [ ] Store contract IDs in config
- [ ] Verify contracts via Stellar Lab
- [ ] Integration test: full event + ticket lifecycle on testnet

### Acceptance Criteria
- All 5 contracts deploy cleanly
- Unit tests pass
- Integration test: create event → stake → mint ticket → transfer → lock

---

## Phase 3 — Event System

**Goal:** Organizers can create events; users can discover them.

### Tasks

#### Backend
- [ ] Event CRUD routes (`/events`)
- [ ] Event service with blockchain sync
- [ ] IPFS upload service (banner images)
- [ ] Event discovery: trending algorithm
- [ ] Full-text search (PostgreSQL `tsvector`)
- [ ] Event filters (category, date, price, location)
- [ ] Organizer profile routes (`/organizers`)
- [ ] Event schema migrations
- [ ] Seed data (20+ sample events)

#### Frontend — Event Creation
- [ ] Multi-step create event wizard
  - Step 1: Basic info (title, description, category)
  - Step 2: Date, time, location
  - Step 3: Ticket tiers configuration
  - Step 4: Banner upload + preview
  - Step 5: Settings (resale, royalties)
  - Step 6: Review + publish
- [ ] Banner image upload with crop/preview
- [ ] Ticket tier builder (dynamic add/remove)
- [ ] Date/time picker with timezone support
- [ ] Rich text editor for description
- [ ] Draft saving (localStorage)

#### Frontend — Discovery
- [ ] Event feed page with infinite scroll
- [ ] Event card component with sold % progress bar
- [ ] Category filter tabs
- [ ] Search bar with debounced query
- [ ] Filter sidebar (date, price, trust tier)
- [ ] Trending section (horizontal scroll)
- [ ] Event detail page (SSR + ISR)
  - Hero banner, description, organizer card
  - Ticket tier cards with real-time availability
  - Map embed (Google Maps)
  - Share / add to calendar

### Acceptance Criteria
- Organizer can create event end-to-end in < 5 minutes
- Event appears in discovery feed
- Search and filters work
- Event page SSR renders correctly

---

## Phase 4 — NFT Ticketing

**Goal:** Users can purchase tickets; NFTs land in their wallets.

### Tasks

#### Backend
- [ ] Ticket purchase route (`POST /tickets/purchase`)
- [ ] Purchase state machine (pending → confirming → confirmed → failed)
- [ ] Stellar payment transaction builder
- [ ] Horizon webhook handler for payment confirmation
- [ ] NFT mint trigger after payment
- [ ] QR payload generation (encrypted, signed)
- [ ] Ticket listing routes (`GET /tickets`, `GET /tickets/:id`)
- [ ] Ticket availability locking (Redis)

#### Frontend
- [ ] Ticket tier selection UI
- [ ] Cart/checkout modal
- [ ] Wallet payment signing flow
- [ ] Purchase status polling (optimistic UI)
- [ ] Success screen with ticket preview
- [ ] User tickets dashboard
- [ ] Ticket detail page with QR code display

#### Security
- [ ] Payment idempotency (prevent double purchase)
- [ ] Inventory reservation (30s Redis lock)
- [ ] Blockchain confirmation verification

### Acceptance Criteria
- User can purchase ticket end-to-end
- NFT appears in Freighter wallet
- QR code generated and displayable
- Failed payments handled gracefully

---

## Phase 5 — QR Check-In System

**Goal:** Organizers can scan tickets; check-ins are secure and real-time.

### Tasks

#### Backend
- [ ] QR generation service (encrypted payload + ED25519 signature)
- [ ] QR validation route (`POST /scanner/validate`)
  - Decrypt payload
  - Verify signature
  - Check expiry (30s window)
  - Check nonce (Redis, single-use)
  - Verify on-chain ownership
  - Check unused status
  - Atomic DB update + blockchain lock
- [ ] Check-in history routes
- [ ] Scanner auth (organizer-only JWT scope)

#### Frontend — Scanner PWA
- [ ] QR scanner page (mobile-optimized)
- [ ] Camera integration (`react-qr-reader` or custom)
- [ ] Scan result overlay (green ✅ / red ❌)
- [ ] Attendee info display post-scan
- [ ] Offline mode (JWT fallback)
- [ ] Scan history feed (last 50 scans)

#### Frontend — Dynamic QR Display
- [ ] Client-side QR rotation (30s timer)
- [ ] Countdown timer display
- [ ] QR refresh on expiry
- [ ] Offline QR display (cached payload)

### Acceptance Criteria
- QR rotates every 30 seconds
- Scanner validates in < 500ms
- Screenshot reuse correctly rejected
- Replay attack rejected
- Double scan rejected

---

## Phase 6 — Attendance Badge NFTs

**Goal:** Checked-in attendees receive soulbound badge NFTs.

### Tasks

#### Backend
- [ ] Badge mint job (triggered by check-in)
- [ ] Badge metadata generation (IPFS upload)
- [ ] Badge queue (Bull/BullMQ)
- [ ] Badge routes (`GET /badges`, `GET /badges/:id`)
- [ ] Badge type determination logic (tier → badge type)
- [ ] Retry logic for failed mints

#### Frontend
- [ ] Badge gallery in user dashboard
- [ ] Badge detail modal (event info, date, type)
- [ ] Badge sharing card generator
- [ ] Animated badge reveal on receipt

### Acceptance Criteria
- Badge minted within 30s of check-in
- Badge non-transferable (verified on-chain)
- Badge appears in user dashboard
- Failed mints retry with backoff

---

## Phase 7 — Organizer Staking

**Goal:** Staking required to publish events; lifecycle managed correctly.

### Tasks

#### Backend
- [ ] Stake calculation service
- [ ] Stake deposit route
- [ ] Stake status routes
- [ ] Event publish gate (requires stake)
- [ ] Stake release job (72h post-event)
- [ ] Dispute filing route (admin-only in v1)
- [ ] Slash execution route
- [ ] Stake history + audit log

#### Frontend
- [ ] Stake requirement display in create event flow
- [ ] Stake payment UI (Freighter signing)
- [ ] Stake status in organizer dashboard
- [ ] Stake release countdown
- [ ] Dispute status display (if applicable)

### Acceptance Criteria
- Cannot publish event without stake
- Stake locked until 72h post-event
- Stake released correctly
- Slash scenario works end-to-end

---

## Phase 8 — Reputation System

**Goal:** Organizer trust tiers are computed and displayed correctly.

### Tasks

#### Backend
- [ ] Reputation score calculation engine
- [ ] Nightly reputation update job
- [ ] Trust tier assignment logic
- [ ] Reputation history tracking
- [ ] Rating submission route (post-event attendee rating)
- [ ] Reputation leaderboard (Redis sorted set)

#### Frontend
- [ ] Reputation score display (organizer profile)
- [ ] Trust tier badge component
- [ ] Reputation history chart
- [ ] Attendee rating UI (post-event)
- [ ] Leaderboard page

### Acceptance Criteria
- Scores computed correctly per formula
- Tiers update correctly after events
- Ratings submittable by attendees
- Leaderboard accurate

---

## Phase 9 — Resale Marketplace

**Goal:** Tickets can be safely resold with royalties enforced.

### Tasks

#### Backend
- [ ] Listing creation route
- [ ] Listing discovery route with filters
- [ ] Purchase route (marketplace buy)
- [ ] Listing cancellation route
- [ ] Royalty calculation service
- [ ] Ownership transfer service
- [ ] Post-sale lock enforcement

#### Frontend
- [ ] Marketplace discovery page
- [ ] Listing card component
- [ ] Create listing modal (from user tickets)
- [ ] Buy listing flow (wallet signing)
- [ ] Price history display
- [ ] "Resale" badge on resold tickets
- [ ] Organizer marketplace analytics

### Acceptance Criteria
- Listing created + visible in marketplace
- Purchase transfers ownership on-chain
- Royalty distributed correctly
- Checked-in tickets cannot be listed

---

## Phase 10 — Real-Time & Dashboards

**Goal:** Dashboards are live, beautiful, and actionable.

### Tasks

#### Backend
- [ ] Socket.IO server setup
- [ ] Namespace architecture (`/event`, `/organizer`, `/marketplace`)
- [ ] Real-time emission on: ticket sale, check-in, listing, sale
- [ ] Analytics aggregation service
- [ ] Revenue calculation service
- [ ] Check-in rate calculator

#### Frontend — Organizer Dashboard
- [ ] Revenue chart (recharts, real-time line chart)
- [ ] Ticket sales progress (animated progress bars)
- [ ] Live check-in feed (real-time list, newest first)
- [ ] Attendee map (if physical event)
- [ ] Badge distribution chart
- [ ] Revenue by tier breakdown
- [ ] Export data (CSV)

#### Frontend — User Dashboard
- [ ] My tickets grid (upcoming + past)
- [ ] Badge collection display
- [ ] Attendance timeline
- [ ] Transaction history

### Acceptance Criteria
- Dashboard updates within 1s of ticket sale
- Check-in feed updates in real-time
- Revenue chart is accurate
- All charts render correctly at 100+ data points

---

## Phase 11 — Polish & Security

**Goal:** Production-ready security, performance, and UX.

### Tasks

#### Security
- [ ] Penetration testing checklist (OWASP Top 10)
- [ ] Smart contract audit (manual review + Semgrep)
- [ ] Rate limiting tuning
- [ ] Input sanitization audit
- [ ] Auth edge cases (expired token, concurrent sessions)
- [ ] QR security audit

#### Performance
- [ ] Next.js bundle analysis
- [ ] Image optimization (next/image)
- [ ] API response profiling
- [ ] Database query optimization (explain analyze)
- [ ] Redis cache hit rate analysis
- [ ] Lighthouse score > 90

#### UX Polish
- [ ] Loading skeletons everywhere
- [ ] Error boundaries + friendly error pages
- [ ] Empty states with CTAs
- [ ] Framer Motion animations (page transitions, card reveals)
- [ ] Mobile responsiveness audit
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Onboarding flow for new users

#### Observability
- [ ] OpenTelemetry traces (API)
- [ ] Structured logging (Winston → cloud)
- [ ] Health check endpoints
- [ ] Uptime monitoring

### Acceptance Criteria
- Lighthouse > 90 on key pages
- No critical security findings
- Mobile experience polished
- Error handling graceful in all scenarios

---

## Phase 12 — Testnet Launch

**Goal:** Fully working platform on Stellar testnet, ready for public beta.

### Tasks

- [ ] End-to-end integration testing
- [ ] Load testing (k6: 500 concurrent users)
- [ ] Testnet seeding with realistic data
  - 10 organizers (varied trust tiers)
  - 50+ events across categories
  - 200+ tickets sold
  - Marketplace listings
- [ ] Testnet documentation
- [ ] User guides (organizer + attendee flows)
- [ ] Bug bash
- [ ] Mainnet deployment runbook
- [ ] Contract upgrade plan

### Acceptance Criteria
- All Phase 0–11 acceptance criteria met
- Load test passes at 500 concurrent users
- Zero critical bugs
- Deployment runbook complete
- Ready for mainnet with config change only

---

## Dependency Map

```
Phase 0 (Foundation)
    └─► Phase 1 (Auth)
            └─► Phase 2 (Contracts) ──────────────────────────────┐
                    └─► Phase 3 (Events)                          │
                            └─► Phase 4 (Ticketing) ◄────────────┤
                                    ├─► Phase 5 (QR)              │
                                    │       └─► Phase 6 (Badges) ◄┤
                                    ├─► Phase 7 (Staking) ◄───────┤
                                    └─► Phase 9 (Marketplace) ◄───┘
                        Phase 8 (Reputation) ◄── Phase 3 + 4 + 5
                        Phase 10 (Realtime) ◄── All phases
                        Phase 11 (Polish) ◄── All phases
                        Phase 12 (Launch) ◄── All phases
```

---

## Technology Decision Log

| Decision | Choice | Rationale |
|----------|--------|----------|
| Monorepo tool | Turborepo | Fast builds, excellent pnpm support |
| API framework | Fastify | Faster than Express, built-in TypeScript |
| ORM | Prisma | Type-safe queries, excellent migrations |
| Validation | Zod | Runtime + compile-time safety |
| Queue | BullMQ | Redis-backed, reliable job processing |
| Real-time | Socket.IO | Mature, fallback support |
| State | Zustand + React Query | Minimal boilerplate, great DX |
| UI | shadcn/ui + Tailwind | Unstyled components, full control |
| IPFS pinning | Pinata | Reliable, CDN-backed |
| Contract testing | soroban-sdk test harness | Native Soroban support |
