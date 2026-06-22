# Product Requirements Document — Steluma

> Luma/Eventbrite for Web3, built on Stellar + Soroban

---

## 1. Executive Summary

**Steluma** is a production-grade event infrastructure platform that brings Web2-level UX to decentralized event management. Built on Stellar blockchain with Soroban smart contracts, it enables organizers to create, manage, and monetize events with verifiable NFT tickets, on-chain staking accountability, QR-based check-ins, and soulbound attendance badges — all invisible to end-users who experience it as a modern SaaS product.

**Tagline:** *Events you can trust. Tickets you truly own.*

---

## 2. Problem Statement

### Web2 Problems
- Centralized ticketing platforms (Ticketmaster, Eventbrite) control ticket ownership
- Ticket fraud and counterfeits cost the industry $1.4B+ annually
- No accountability for organizer scams or event cancellations
- Platform fees (15–25%) extracted with no value to creators or attendees
- No verifiable proof of attendance

### Web3 Existing Gaps
- Existing NFT ticketing solutions are overly crypto-native and intimidating
- Poor UX drives mainstream abandonment
- No escrow/staking to ensure organizer accountability
- No integrated reputation systems
- Fragmented tools — no unified platform

### The Opportunity
A platform that combines the trust guarantees of blockchain (true ownership, escrow accountability, verifiable attendance) with the polish and usability of a modern Web2 product.

---

## 3. Target Users

### Primary: Event Organizers
- **New Organizers:** Indie creators, community managers, local businesses
- **Verified Organizers:** Conferences, festivals, professional event companies
- **Partner Organizers:** Enterprise clients with custom SLAs

Pain points: no accountability mechanisms, platform lock-in, fraud exposure, high fees

### Secondary: Event Attendees
- Crypto-curious mainstream users who value ownership
- Web3 natives who want verifiable attendance history
- Collectors interested in attendance badges

Pain points: ticket fraud, no resale protections, no proof of attendance

### Tertiary: Marketplace Resellers
- Users looking to resell tickets with enforced royalties
- Secondary market participants

---

## 4. Product Principles

1. **Invisible Blockchain** — Crypto complexity is hidden. No seed phrases in the main flow.
2. **Organizer Accountability** — Staking creates real skin in the game.
3. **True Ownership** — Tickets and badges live in user wallets.
4. **Real-Time Everything** — Dashboards, check-ins, and sales update live.
5. **Premium Design** — The UI should feel like Linear or Luma, not OpenSea.
6. **Security First** — QR anti-fraud, signature verification, rate limiting.

---

## 5. Feature Specifications

### 5.1 Authentication

| Feature | Requirement | Priority |
|---------|------------|---------|
| Freighter wallet connect | One-click wallet auth via Stellar Freighter | P0 |
| Session management | JWT + wallet signature verification | P0 |
| Protected routes | Middleware-gated pages | P0 |
| Email/social placeholder | Architecture stub for future OAuth | P1 |
| Auto-disconnect on wallet change | Session invalidated on account switch | P0 |

**Auth Flow:**
1. User clicks "Connect Wallet"
2. Freighter extension prompts signature
3. Backend verifies signature against public key
4. JWT issued (15min access + 7d refresh)
5. Session stored in Redis with wallet fingerprint

---

### 5.2 Organizer System

**Organizer Profile Fields:**
- Wallet address (primary identifier)
- Display name, bio, avatar (IPFS)
- Reputation score (0–1000)
- Trust tier (New / Verified / Trusted / Partner)
- Total events hosted
- Successful event ratio
- Total attendees served
- Verification status + badge
- Social links
- Dispute history

**Event Creation Fields:**
- Title, description (rich text)
- Banner image (IPFS upload)
- Category (Conference / Concert / Sports / Community / Workshop / etc.)
- Location (physical address or virtual link)
- Start/end datetime + timezone
- Ticket tiers (unlimited tiers, each with: name, price, supply, perks, transfer restrictions)
- Stake amount (computed minimum + organizer optional top-up)
- Max resale price (optional)
- Royalty fee % (default 5%)
- Refund policy
- Public/private toggle

---

### 5.3 Organizer Staking System

**CRITICAL FEATURE — Full Specification**

#### Stake Calculation
```
minimum_stake = max(
  base_floor (100 XLM),
  ticket_revenue_estimate * 0.10,
  reputation_multiplier(tier) * revenue
)
```

| Trust Tier | Stake Multiplier | Slash Cap |
|-----------|----------------|---------|
| New | 15% of revenue | 100% |
| Verified | 10% of revenue | 75% |
| Trusted | 5% of revenue | 50% |
| Partner | 2% of revenue | 25% |

#### Stake Lifecycle
```
DRAFT → STAKED → ACTIVE → COMPLETED → RELEASED
                    ↓
                DISPUTED → SLASHED
```

1. **DRAFT:** Event created, not yet published
2. **STAKED:** Organizer deposits stake to EscrowStakingContract
3. **ACTIVE:** Event is live and ticketing open
4. **COMPLETED:** Event end datetime passed + no disputes within 72h window
5. **RELEASED:** Stake returned to organizer wallet
6. **DISPUTED:** Attendee/community flag triggers dispute window
7. **SLASHED:** DAO/admin rules on slash percentage; remainder returned

#### Future Architecture Hooks
- `dispute_resolver` field reserved for DAO contract address
- `slash_percentage` configurable per dispute type
- `reputation_decay` function on failed events

---

### 5.4 Event Discovery

**Feed Types:**
- Trending (ticket velocity + engagement score)
- Upcoming (chronological by start date)
- Near You (geo-proximity, opt-in)
- By Category
- By Organizer (follow system)

**Search:**
- Full-text search (title, description, tags)
- Filters: date range, price range, category, location, trust tier
- Sort: relevance, date, price, popularity

**Event Page:**
- Hero banner with parallax
- Rich description with embeds
- Ticket tier cards with real-time availability
- Organizer profile card with reputation
- Map embed (physical events)
- Social proof (attendee count, sold %)
- Share / add to calendar

---

### 5.5 NFT Ticketing

**Lazy Minting Flow:**
1. User selects tier + quantity
2. Frontend shows cart with total
3. User connects wallet (if not connected)
4. Backend creates pending purchase record
5. User signs Stellar payment transaction
6. Payment confirmed on-chain
7. **TicketNFTContract.mint()** called by backend
8. NFT transferred to buyer wallet
9. QR payload generated + encrypted
10. User receives ticket in dashboard

**NFT Metadata (stored on IPFS):**
```json
{
  "name": "Ticket #0042 — DevConf 2025",
  "description": "...",
  "image": "ipfs://...",
  "attributes": [
    { "trait_type": "Event ID", "value": "uuid" },
    { "trait_type": "Tier", "value": "VIP" },
    { "trait_type": "Ticket ID", "value": "42" },
    { "trait_type": "Seat", "value": "A-12" },
    { "trait_type": "Timestamp", "value": "2025-09-01T09:00:00Z" },
    { "trait_type": "Status", "value": "unused" }
  ],
  "qr_payload_hash": "sha256:...",
  "event_contract": "C...",
  "ticket_contract": "C..."
}
```

---

### 5.6 QR Check-In System

**Security Architecture:**

| Layer | Mechanism |
|-------|----------|
| Anti-screenshot | Time-based rotating QR (30s validity window) |
| Anti-replay | Nonce + timestamp in signed payload |
| Ownership proof | Backend verifies NFT ownership at scan time |
| Double-entry prevention | Redis lock + DB atomic update |
| Offline fallback | Signed JWT with 5-minute validity |

**QR Payload (encrypted):**
```json
{
  "ticket_id": "uuid",
  "event_id": "uuid",
  "wallet": "G...",
  "nonce": "random-32-bytes",
  "issued_at": 1700000000,
  "expires_at": 1700000030,
  "signature": "backend-ed25519-signature"
}
```

**Scanner Flow:**
1. Organizer opens scanner (mobile PWA or dedicated scanner app)
2. Camera reads QR
3. Payload decrypted + signature verified
4. Backend checks: ownership on-chain, expiry, unused status
5. Atomic DB update: `checked_in = true`
6. Socket.IO event fires to organizer dashboard
7. Scanner shows ✅ green or ❌ red with reason
8. **AttendanceBadgeContract.mint()** triggered async

---

### 5.7 Attendance Badge NFTs

**Badge Tiers:**

| Type | Criteria | Transferable |
|------|---------|-------------|
| Attendee | Checked in | No (soulbound) |
| VIP | VIP ticket + checked in | No |
| Speaker | Speaker ticket + checked in | No |
| Organizer | Event organizer | No |
| Volunteer | Volunteer ticket | No |
| Early Bird | First 10% to purchase | No |

**Badge Metadata:**
```json
{
  "name": "DevConf 2025 — Attendee",
  "image": "ipfs://...",
  "attributes": [
    { "trait_type": "Event", "value": "DevConf 2025" },
    { "trait_type": "Date", "value": "2025-09-01" },
    { "trait_type": "Role", "value": "Attendee" },
    { "trait_type": "Badge Type", "value": "soulbound" }
  ],
  "soulbound": true,
  "event_id": "uuid",
  "issued_at": "ISO8601"
}
```

---

### 5.8 Real-Time Features

**Socket.IO Namespaces:**

| Namespace | Events | Consumers |
|-----------|--------|----------|
| `/event/:id` | `ticket_sold`, `availability_update` | Public event page |
| `/organizer/:id` | `checkin`, `revenue_update`, `analytics_update` | Organizer dashboard |
| `/marketplace` | `listing_created`, `sale_completed` | Marketplace page |
| `/admin` | `dispute_filed`, `slash_triggered` | Admin panel |

---

### 5.9 Reputation System

**Score Calculation:**
```
reputation_score = (
  successful_events_ratio * 400 +
  avg_attendee_rating * 200 +
  attendance_rate * 200 +
  account_age_factor * 100 +
  stake_history_bonus * 100
) - dispute_penalty
```

**Trust Tier Thresholds:**

| Tier | Score | Events | Verification |
|------|-------|--------|-------------|
| New | 0–199 | 0–2 | None |
| Verified | 200–499 | 3+ | ID/KYB |
| Trusted | 500–799 | 10+ | Community vote |
| Partner | 800–1000 | 25+ | Manual review |

---

### 5.10 Resale Marketplace

**Listing Requirements:**
- Ticket must be unused (not checked-in)
- Ticket transfer must not be restricted by event
- Listing price ≤ max_resale_price (if set by organizer)
- Seller must sign listing transaction

**Royalty Enforcement:**
- Royalty % set at event creation (default 5%, max 20%)
- Enforced on-chain by MarketplaceContract
- Distributed: royalty → organizer, remainder → seller

**Safety:**
- After check-in: transfer locked on-chain
- Smart contract validates ownership before transfer
- Frontend shows "verified original" badge

---

### 5.11 Dashboards

**Organizer Dashboard Panels:**
- Revenue (total, by tier, over time)
- Tickets sold vs. available (progress bars per tier)
- Real-time check-in feed (name, time, tier)
- Attendee analytics (wallets, badge tier distribution)
- Stake status + release countdown
- Event management (edit, cancel, export)
- Reputation metrics

**User Dashboard Panels:**
- My Tickets (upcoming, past)
- Attendance history with badges
- Resale listings (active, sold)
- Profile/reputation for attendees
- Transaction history

---

## 6. Non-Functional Requirements

| Category | Requirement |
|---------|------------|
| Performance | Page load < 2s, API p95 < 200ms |
| Availability | 99.9% uptime target |
| Scalability | 100k concurrent users, 1M tickets/day |
| Security | OWASP Top 10, wallet sig verification, rate limiting |
| Compliance | GDPR-ready data architecture |
| Accessibility | WCAG 2.1 AA |
| Mobile | Full PWA, responsive design |

---

## 7. Success Metrics

| Metric | 3-Month Target | 12-Month Target |
|--------|--------------|----------------|
| Events Created | 500 | 10,000 |
| Tickets Issued | 5,000 | 500,000 |
| Organizer Staked TVL | $50k | $5M |
| QR Check-In Success Rate | >99% | >99.5% |
| Attendance Badge NFTs | 4,000 | 400,000 |
| Marketplace Volume | $10k | $2M |
| User NPS | >50 | >65 |

---

## 8. Out of Scope (v1)

- Mobile native apps (iOS/Android) — PWA first
- DAO governance for disputes — admin-controlled in v1
- Multi-chain support — Stellar only
- Physical merchandise delivery
- Streaming/virtual event infrastructure
- Fiat on-ramp integration (future partnership)
