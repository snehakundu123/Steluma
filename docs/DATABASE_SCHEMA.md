# Database Schema — Steluma

> PostgreSQL 15. Managed via Prisma ORM.

---

## Design Principles

1. **Blockchain is source of truth for ownership** — PostgreSQL mirrors/caches on-chain state
2. **Denormalize for read performance** — store computed fields (ticket count, revenue) for dashboard speed
3. **Soft deletes everywhere** — `deleted_at` timestamp, never hard delete
4. **Audit trail** — `created_at`, `updated_at` on every table
5. **UUID primary keys** — no sequential IDs exposed in URLs
6. **JSONB for flexible metadata** — event attributes, ticket attributes without schema migrations

---

## Prisma Schema

```prisma
// apps/api/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================================
// USERS & AUTH
// ============================================================

model User {
  id                String    @id @default(uuid())
  walletAddress     String    @unique @map("wallet_address")
  displayName       String?   @map("display_name")
  bio               String?
  avatarIpfsCid     String?   @map("avatar_ipfs_cid")
  email             String?   @unique   // Future: email auth
  emailVerified     Boolean   @default(false) @map("email_verified")
  role              UserRole  @default(ATTENDEE)
  isActive          Boolean   @default(true) @map("is_active")
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")
  deletedAt         DateTime? @map("deleted_at")

  sessions          Session[]
  organizerProfile  OrganizerProfile?
  tickets           Ticket[]
  badges            AttendanceBadge[]
  marketplaceListings MarketplaceListing[]
  ratings           EventRating[]
  notifications     Notification[]
  checkIns          CheckIn[]

  @@map("users")
  @@index([walletAddress])
  @@index([role])
}

enum UserRole {
  ATTENDEE
  ORGANIZER
  ADMIN
}

model Session {
  id            String    @id @default(uuid())
  userId        String    @map("user_id")
  jti           String    @unique  // JWT ID for invalidation
  walletAddress String    @map("wallet_address")
  expiresAt     DateTime  @map("expires_at")
  createdAt     DateTime  @default(now()) @map("created_at")
  revokedAt     DateTime? @map("revoked_at")
  ipAddress     String?   @map("ip_address")
  userAgent     String?   @map("user_agent")

  user          User      @relation(fields: [userId], references: [id])

  @@map("sessions")
  @@index([userId])
  @@index([jti])
  @@index([expiresAt])
}

model AuthNonce {
  walletAddress String    @id @map("wallet_address")
  nonce         String
  expiresAt     DateTime  @map("expires_at")
  createdAt     DateTime  @default(now()) @map("created_at")

  @@map("auth_nonces")
}

// ============================================================
// ORGANIZER PROFILES
// ============================================================

model OrganizerProfile {
  id                  String        @id @default(uuid())
  userId              String        @unique @map("user_id")
  walletAddress       String        @unique @map("wallet_address")
  organizationName    String?       @map("organization_name")
  website             String?
  twitterHandle       String?       @map("twitter_handle")
  verificationStatus  VerificationStatus @default(UNVERIFIED) @map("verification_status")
  trustTier           TrustTier     @default(NEW) @map("trust_tier")
  reputationScore     Int           @default(0) @map("reputation_score")
  totalEventsHosted   Int           @default(0) @map("total_events_hosted")
  successfulEvents    Int           @default(0) @map("successful_events")
  totalAttendeesServed Int          @default(0) @map("total_attendees_served")
  totalRevenue        Decimal       @default(0) @db.Decimal(18, 7) @map("total_revenue")
  averageRating       Decimal       @default(0) @db.Decimal(3, 2) @map("average_rating")
  ratingCount         Int           @default(0) @map("rating_count")
  disputeCount        Int           @default(0) @map("dispute_count")
  createdAt           DateTime      @default(now()) @map("created_at")
  updatedAt           DateTime      @updatedAt @map("updated_at")

  user                User          @relation(fields: [userId], references: [id])
  events              Event[]
  stakes              OrganizerStake[]
  reputationHistory   ReputationHistory[]

  @@map("organizer_profiles")
  @@index([trustTier])
  @@index([reputationScore])
  @@index([walletAddress])
}

enum VerificationStatus {
  UNVERIFIED
  PENDING
  VERIFIED
  SUSPENDED
}

enum TrustTier {
  NEW
  VERIFIED
  TRUSTED
  PARTNER
}

// ============================================================
// EVENTS
// ============================================================

model Event {
  id                  String      @id @default(uuid())
  slug                String      @unique
  organizerId         String      @map("organizer_id")
  title               String
  description         String      @db.Text
  category            EventCategory
  bannerIpfsCid       String?     @map("banner_ipfs_cid")
  bannerUrl           String?     @map("banner_url")     // CDN URL for fast load
  locationType        LocationType @default(PHYSICAL) @map("location_type")
  locationAddress     String?     @map("location_address")
  locationCity        String?     @map("location_city")
  locationCountry     String?     @map("location_country")
  locationLat         Decimal?    @db.Decimal(10, 8) @map("location_lat")
  locationLng         Decimal?    @db.Decimal(11, 8) @map("location_lng")
  virtualLink         String?     @map("virtual_link")
  startsAt            DateTime    @map("starts_at")
  endsAt              DateTime    @map("ends_at")
  timezone            String      @default("UTC")
  status              EventStatus @default(DRAFT)
  visibility          EventVisibility @default(PUBLIC)
  maxResalePrice      Decimal?    @db.Decimal(18, 7) @map("max_resale_price")
  royaltyBps          Int         @default(500) @map("royalty_bps")  // 500 = 5%
  refundPolicy        String?     @map("refund_policy") @db.Text
  tags                String[]    @default([])
  metadataIpfsCid     String?     @map("metadata_ipfs_cid")
  onChainEventId      BigInt?     @map("on_chain_event_id")  // Stellar contract event ID
  stakeRequired       Decimal     @default(0) @db.Decimal(18, 7) @map("stake_required")
  searchVector        Unsupported("tsvector")? @map("search_vector")

  // Denormalized counters (updated by triggers)
  totalTickets        Int         @default(0) @map("total_tickets")
  ticketsSold         Int         @default(0) @map("tickets_sold")
  totalRevenue        Decimal     @default(0) @db.Decimal(18, 7) @map("total_revenue")
  checkedInCount      Int         @default(0) @map("checked_in_count")
  viewCount           Int         @default(0) @map("view_count")
  trendingScore       Decimal     @default(0) @db.Decimal(10, 4) @map("trending_score")

  createdAt           DateTime    @default(now()) @map("created_at")
  updatedAt           DateTime    @updatedAt @map("updated_at")
  publishedAt         DateTime?   @map("published_at")
  deletedAt           DateTime?   @map("deleted_at")

  organizer           OrganizerProfile @relation(fields: [organizerId], references: [id])
  ticketTiers         TicketTier[]
  tickets             Ticket[]
  stake               OrganizerStake?
  checkIns            CheckIn[]
  ratings             EventRating[]
  marketplaceListings MarketplaceListing[]
  badges              AttendanceBadge[]
  analytics           EventAnalytics[]

  @@map("events")
  @@index([status, visibility, startsAt])
  @@index([organizerId])
  @@index([category])
  @@index([trendingScore(sort: Desc)])
  @@index([startsAt])
  @@index([slug])
}

enum EventCategory {
  CONFERENCE
  CONCERT
  SPORTS
  COMMUNITY
  WORKSHOP
  HACKATHON
  NETWORKING
  FESTIVAL
  WEBINAR
  OTHER
}

enum EventStatus {
  DRAFT
  STAKED
  ACTIVE
  COMPLETED
  CANCELLED
  DISPUTED
}

enum EventVisibility {
  PUBLIC
  PRIVATE
  UNLISTED
}

enum LocationType {
  PHYSICAL
  VIRTUAL
  HYBRID
}

// ============================================================
// TICKET TIERS
// ============================================================

model TicketTier {
  id                String    @id @default(uuid())
  eventId           String    @map("event_id")
  name              String
  description       String?
  price             Decimal   @db.Decimal(18, 7)
  priceAsset        String    @default("XLM") @map("price_asset")  // "XLM" or USDC contract
  totalSupply       Int       @map("total_supply")
  sold              Int       @default(0)
  sortOrder         Int       @default(0) @map("sort_order")
  isTransferable    Boolean   @default(true) @map("is_transferable")
  maxPerWallet      Int       @default(10) @map("max_per_wallet")
  saleStartsAt      DateTime? @map("sale_starts_at")
  saleEndsAt        DateTime? @map("sale_ends_at")
  perks             String[]  @default([])
  badgeType         BadgeType @default(ATTENDEE) @map("badge_type")
  isVisible         Boolean   @default(true) @map("is_visible")
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  event             Event     @relation(fields: [eventId], references: [id])
  tickets           Ticket[]

  @@map("ticket_tiers")
  @@index([eventId])
}

// ============================================================
// TICKETS
// ============================================================

model Ticket {
  id                  String        @id @default(uuid())
  eventId             String        @map("event_id")
  tierId              String        @map("tier_id")
  ownerId             String        @map("owner_id")
  ownerWallet         String        @map("owner_wallet")
  ticketNumber        Int           @map("ticket_number")    // Sequential per event
  status              TicketStatus  @default(PENDING)
  onChainTokenId      BigInt?       @map("on_chain_token_id")
  metadataIpfsCid     String?       @map("metadata_ipfs_cid")
  purchasePrice       Decimal       @db.Decimal(18, 7) @map("purchase_price")
  purchaseAsset       String        @map("purchase_asset")
  purchaseTxHash      String?       @map("purchase_tx_hash")
  mintTxHash          String?       @map("mint_tx_hash")
  qrPayloadHash       String?       @map("qr_payload_hash")  // Hash of current valid QR
  isResale            Boolean       @default(false) @map("is_resale")
  originalPrice       Decimal?      @db.Decimal(18, 7) @map("original_price")
  createdAt           DateTime      @default(now()) @map("created_at")
  updatedAt           DateTime      @updatedAt @map("updated_at")

  event               Event         @relation(fields: [eventId], references: [id])
  tier                TicketTier    @relation(fields: [tierId], references: [id])
  owner               User          @relation(fields: [ownerId], references: [id])
  checkIn             CheckIn?
  marketplaceListings MarketplaceListing[]

  @@map("tickets")
  @@unique([eventId, ticketNumber])
  @@index([ownerId])
  @@index([eventId])
  @@index([ownerWallet])
  @@index([onChainTokenId])
  @@index([status])
}

enum TicketStatus {
  PENDING         // Payment initiated
  CONFIRMING      // Payment on-chain, awaiting confirmation
  ACTIVE          // Minted and valid
  CHECKED_IN      // Used at event
  CANCELLED       // Cancelled/refunded
  LISTED          // Listed on marketplace
  TRANSFERRED     // Transferred to new owner
}

// ============================================================
// CHECK-INS
// ============================================================

model CheckIn {
  id              String    @id @default(uuid())
  ticketId        String    @unique @map("ticket_id")
  eventId         String    @map("event_id")
  userId          String    @map("user_id")
  scannedBy       String    @map("scanned_by")    // Organizer wallet
  qrNonce         String    @map("qr_nonce")      // Used QR nonce
  checkedInAt     DateTime  @default(now()) @map("checked_in_at")
  deviceInfo      String?   @map("device_info")
  isOnline        Boolean   @default(true) @map("is_online")
  badgeMinted     Boolean   @default(false) @map("badge_minted")
  badgeId         String?   @map("badge_id")

  ticket          Ticket    @relation(fields: [ticketId], references: [id])
  event           Event     @relation(fields: [eventId], references: [id])
  user            User      @relation(fields: [userId], references: [id])

  @@map("check_ins")
  @@index([eventId, checkedInAt])
  @@index([userId])
}

// ============================================================
// ATTENDANCE BADGES
// ============================================================

model AttendanceBadge {
  id                  String    @id @default(uuid())
  userId              String    @map("user_id")
  ownerWallet         String    @map("owner_wallet")
  eventId             String    @map("event_id")
  badgeType           BadgeType @map("badge_type")
  onChainTokenId      BigInt?   @map("on_chain_token_id")
  metadataIpfsCid     String?   @map("metadata_ipfs_cid")
  mintTxHash          String?   @map("mint_tx_hash")
  mintStatus          MintStatus @default(PENDING) @map("mint_status")
  issuedAt            DateTime  @default(now()) @map("issued_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")

  user                User      @relation(fields: [userId], references: [id])
  event               Event     @relation(fields: [eventId], references: [id])

  @@unique([userId, eventId, badgeType])
  @@map("attendance_badges")
  @@index([userId])
  @@index([eventId])
  @@index([ownerWallet])
}

enum BadgeType {
  ATTENDEE
  VIP
  SPEAKER
  ORGANIZER
  VOLUNTEER
  EARLY_BIRD
}

enum MintStatus {
  PENDING
  MINTING
  MINTED
  FAILED
}

// ============================================================
// ORGANIZER STAKING
// ============================================================

model OrganizerStake {
  id                String      @id @default(uuid())
  organizerId       String      @map("organizer_id")
  eventId           String      @unique @map("event_id")
  amount            Decimal     @db.Decimal(18, 7)
  asset             String      // "XLM" or USDC contract address
  status            StakeStatus @default(PENDING)
  stakeTxHash       String?     @map("stake_tx_hash")
  releaseTxHash     String?     @map("release_tx_hash")
  slashTxHash       String?     @map("slash_tx_hash")
  slashPercentage   Int?        @map("slash_percentage")   // Basis points
  slashRecipient    String?     @map("slash_recipient")
  slashReason       String?     @map("slash_reason") @db.Text
  stakedAt          DateTime?   @map("staked_at")
  completedAt       DateTime?   @map("completed_at")
  releaseAfter      DateTime?   @map("release_after")      // 72h after completed
  releasedAt        DateTime?   @map("released_at")
  createdAt         DateTime    @default(now()) @map("created_at")
  updatedAt         DateTime    @updatedAt @map("updated_at")

  organizer         OrganizerProfile @relation(fields: [organizerId], references: [id])
  event             Event        @relation(fields: [eventId], references: [id])
  disputes          StakeDispute[]

  @@map("organizer_stakes")
  @@index([organizerId])
  @@index([status])
  @@index([releaseAfter])
}

enum StakeStatus {
  PENDING
  STAKED
  COMPLETED
  RELEASED
  DISPUTED
  SLASHED
}

model StakeDispute {
  id            String          @id @default(uuid())
  stakeId       String          @map("stake_id")
  filedBy       String          @map("filed_by")
  reason        String          @db.Text
  evidence      String?         @db.Text
  status        DisputeStatus   @default(OPEN)
  resolution    String?         @db.Text
  resolvedBy    String?         @map("resolved_by")
  resolvedAt    DateTime?       @map("resolved_at")
  createdAt     DateTime        @default(now()) @map("created_at")
  updatedAt     DateTime        @updatedAt @map("updated_at")

  stake         OrganizerStake  @relation(fields: [stakeId], references: [id])

  @@map("stake_disputes")
}

enum DisputeStatus {
  OPEN
  UNDER_REVIEW
  RESOLVED_NO_SLASH
  RESOLVED_PARTIAL_SLASH
  RESOLVED_FULL_SLASH
}

// ============================================================
// MARKETPLACE
// ============================================================

model MarketplaceListing {
  id                  String          @id @default(uuid())
  ticketId            String          @map("ticket_id")
  eventId             String          @map("event_id")
  sellerId            String          @map("seller_id")
  sellerWallet        String          @map("seller_wallet")
  price               Decimal         @db.Decimal(18, 7)
  asset               String          // XLM or USDC
  royaltyBps          Int             @map("royalty_bps")
  royaltyRecipient    String          @map("royalty_recipient")
  maxPrice            Decimal?        @db.Decimal(18, 7) @map("max_price")
  status              ListingStatus   @default(ACTIVE)
  listTxHash          String?         @map("list_tx_hash")
  saleTxHash          String?         @map("sale_tx_hash")
  buyerWallet         String?         @map("buyer_wallet")
  buyerId             String?         @map("buyer_id")
  salePrice           Decimal?        @db.Decimal(18, 7) @map("sale_price")
  royaltyPaid         Decimal?        @db.Decimal(18, 7) @map("royalty_paid")
  listedAt            DateTime        @default(now()) @map("listed_at")
  soldAt              DateTime?       @map("sold_at")
  cancelledAt         DateTime?       @map("cancelled_at")
  expiresAt           DateTime?       @map("expires_at")

  ticket              Ticket          @relation(fields: [ticketId], references: [id])
  event               Event           @relation(fields: [eventId], references: [id])
  seller              User            @relation(fields: [sellerId], references: [id])

  @@map("marketplace_listings")
  @@index([status, eventId])
  @@index([sellerId])
  @@index([ticketId])
  @@index([listedAt(sort: Desc)])
}

enum ListingStatus {
  ACTIVE
  SOLD
  CANCELLED
  EXPIRED
}

// ============================================================
// REPUTATION
// ============================================================

model ReputationHistory {
  id              String    @id @default(uuid())
  organizerId     String    @map("organizer_id")
  eventId         String?   @map("event_id")
  scoreBefore     Int       @map("score_before")
  scoreAfter      Int       @map("score_after")
  delta           Int
  reason          String
  metadata        Json?
  createdAt       DateTime  @default(now()) @map("created_at")

  organizer       OrganizerProfile @relation(fields: [organizerId], references: [id])

  @@map("reputation_history")
  @@index([organizerId, createdAt(sort: Desc)])
}

model EventRating {
  id          String    @id @default(uuid())
  eventId     String    @map("event_id")
  userId      String    @map("user_id")
  rating      Int       // 1–5
  review      String?   @db.Text
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  event       Event     @relation(fields: [eventId], references: [id])
  user        User      @relation(fields: [userId], references: [id])

  @@unique([eventId, userId])
  @@map("event_ratings")
  @@index([eventId])
}

// ============================================================
// ANALYTICS
// ============================================================

model EventAnalytics {
  id                String    @id @default(uuid())
  eventId           String    @map("event_id")
  timestamp         DateTime  @default(now())
  ticketsSold       Int       @map("tickets_sold")
  revenue           Decimal   @db.Decimal(18, 7)
  checkIns          Int       @map("check_ins")
  pageViews         Int       @map("page_views")
  uniqueVisitors    Int       @map("unique_visitors")
  conversionRate    Decimal   @db.Decimal(5, 4) @map("conversion_rate")
  granularity       AnalyticsGranularity @default(HOURLY)

  event             Event     @relation(fields: [eventId], references: [id])

  @@map("event_analytics")
  @@index([eventId, timestamp(sort: Desc)])
  @@index([granularity, timestamp])
}

enum AnalyticsGranularity {
  MINUTE
  HOURLY
  DAILY
}

// ============================================================
// NOTIFICATIONS
// ============================================================

model Notification {
  id          String              @id @default(uuid())
  userId      String              @map("user_id")
  type        NotificationType
  title       String
  body        String              @db.Text
  data        Json?               // Contextual data (event_id, ticket_id, etc.)
  isRead      Boolean             @default(false) @map("is_read")
  readAt      DateTime?           @map("read_at")
  createdAt   DateTime            @default(now()) @map("created_at")

  user        User                @relation(fields: [userId], references: [id])

  @@map("notifications")
  @@index([userId, isRead, createdAt(sort: Desc)])
}

enum NotificationType {
  TICKET_PURCHASED
  TICKET_SOLD
  EVENT_STARTING_SOON
  CHECK_IN_SUCCESS
  BADGE_EARNED
  STAKE_RELEASED
  DISPUTE_FILED
  REPUTATION_UPDATE
  LISTING_SOLD
  SYSTEM
}

// ============================================================
// IPFS ASSETS
// ============================================================

model IpfsAsset {
  id          String    @id @default(uuid())
  cid         String    @unique
  filename    String?
  mimeType    String?   @map("mime_type")
  sizeBytes   BigInt?   @map("size_bytes")
  pinStatus   String    @default("pinned") @map("pin_status")
  uploadedBy  String?   @map("uploaded_by")
  createdAt   DateTime  @default(now()) @map("created_at")

  @@map("ipfs_assets")
  @@index([cid])
}
```

---

## Migrations

### Initial Migration

```sql
-- Generated by Prisma migrate, annotated for clarity

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable full-text search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Search vector trigger for events
CREATE OR REPLACE FUNCTION events_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', array_to_string(NEW.tags, ' ')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_search_vector_trigger
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION events_search_vector_update();

-- Search index
CREATE INDEX events_search_idx ON events USING gin(search_vector);

-- Trending score update function
CREATE OR REPLACE FUNCTION calculate_trending_score(
  tickets_sold INT,
  view_count INT,
  hours_since_created FLOAT
) RETURNS DECIMAL AS $$
BEGIN
  RETURN (tickets_sold * 10 + view_count) / (POWER(hours_since_created + 2, 1.8));
END;
$$ LANGUAGE plpgsql;
```

### Seed Data Structure

```typescript
// apps/api/prisma/seed.ts

const seedOrganizers = [
  {
    wallet: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
    name: 'DevDAO',
    tier: 'TRUSTED',
    reputationScore: 720,
    totalEventsHosted: 15,
  },
  // ...9 more
]

const seedEvents = [
  {
    title: 'Stellar Summit 2025',
    category: 'CONFERENCE',
    startsAt: new Date('2025-09-15T09:00:00Z'),
    tiers: [
      { name: 'General Admission', price: 50, supply: 500 },
      { name: 'VIP', price: 200, supply: 50 },
      { name: 'Speaker', price: 0, supply: 20 },
    ],
  },
  // ...49 more
]
```

---

## Index Strategy

```sql
-- High-frequency query patterns

-- Event discovery (most common)
CREATE INDEX idx_events_discovery ON events(status, visibility, starts_at)
  WHERE deleted_at IS NULL AND status = 'ACTIVE' AND visibility = 'PUBLIC';

-- Trending feed
CREATE INDEX idx_events_trending ON events(trending_score DESC)
  WHERE deleted_at IS NULL AND status = 'ACTIVE';

-- Ticket ownership lookup (QR validation critical path)
CREATE INDEX idx_tickets_wallet ON tickets(owner_wallet, status)
  WHERE status != 'CANCELLED';

-- Active marketplace listings per event
CREATE INDEX idx_marketplace_event ON marketplace_listings(event_id, status, price)
  WHERE status = 'ACTIVE';

-- Reputation leaderboard
CREATE INDEX idx_organizer_reputation ON organizer_profiles(reputation_score DESC, trust_tier);

-- Stake release job
CREATE INDEX idx_stake_release ON organizer_stakes(release_after, status)
  WHERE status = 'COMPLETED';
```

---

## Performance Notes

| Query | Index Used | Expected p95 |
|-------|-----------|-------------|
| Event discovery feed | `idx_events_discovery` + trending | <20ms |
| Full-text event search | `events_search_idx` (GIN) | <30ms |
| Ticket ownership (QR scan) | `idx_tickets_wallet` | <5ms |
| Organizer dashboard stats | Denormalized counters, no join | <10ms |
| Marketplace listings | `idx_marketplace_event` | <15ms |

---

## Connection Pooling

```
# PgBouncer config (production)
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20
reserve_pool_size = 5
reserve_pool_timeout = 3

# Prisma connection string
DATABASE_URL="postgresql://user:pass@pgbouncer:5432/steluma?schema=public&connection_limit=1&pool_timeout=20"
```
