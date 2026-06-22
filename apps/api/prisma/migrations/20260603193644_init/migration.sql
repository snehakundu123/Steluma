-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ATTENDEE', 'ORGANIZER', 'ADMIN');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TrustTier" AS ENUM ('NEW', 'VERIFIED', 'TRUSTED', 'PARTNER');

-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('CONFERENCE', 'CONCERT', 'SPORTS', 'COMMUNITY', 'WORKSHOP', 'HACKATHON', 'NETWORKING', 'FESTIVAL', 'WEBINAR', 'OTHER');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'STAKED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'UNLISTED');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('PHYSICAL', 'VIRTUAL', 'HYBRID');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('PENDING', 'CONFIRMING', 'ACTIVE', 'CHECKED_IN', 'CANCELLED', 'LISTED', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "BadgeType" AS ENUM ('ATTENDEE', 'VIP', 'SPEAKER', 'ORGANIZER', 'VOLUNTEER', 'EARLY_BIRD');

-- CreateEnum
CREATE TYPE "MintStatus" AS ENUM ('PENDING', 'MINTING', 'MINTED', 'FAILED');

-- CreateEnum
CREATE TYPE "StakeStatus" AS ENUM ('PENDING', 'STAKED', 'COMPLETED', 'RELEASED', 'DISPUTED', 'SLASHED');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'SOLD', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TICKET_PURCHASED', 'TICKET_SOLD', 'EVENT_STARTING_SOON', 'CHECK_IN_SUCCESS', 'BADGE_EARNED', 'STAKE_RELEASED', 'DISPUTE_FILED', 'REPUTATION_UPDATE', 'LISTING_SOLD', 'SYSTEM');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "display_name" TEXT,
    "bio" TEXT,
    "avatar_ipfs_cid" TEXT,
    "email" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'ATTENDEE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "ip_address" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_nonces" (
    "wallet_address" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_nonces_pkey" PRIMARY KEY ("wallet_address")
);

-- CreateTable
CREATE TABLE "organizer_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "organization_name" TEXT,
    "website" TEXT,
    "twitter_handle" TEXT,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "trust_tier" "TrustTier" NOT NULL DEFAULT 'NEW',
    "reputation_score" INTEGER NOT NULL DEFAULT 0,
    "total_events_hosted" INTEGER NOT NULL DEFAULT 0,
    "successful_events" INTEGER NOT NULL DEFAULT 0,
    "total_attendees_served" INTEGER NOT NULL DEFAULT 0,
    "total_revenue" DECIMAL(18,7) NOT NULL DEFAULT 0,
    "average_rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "dispute_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "organizer_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "EventCategory" NOT NULL,
    "banner_ipfs_cid" TEXT,
    "banner_url" TEXT,
    "location_type" "LocationType" NOT NULL DEFAULT 'PHYSICAL',
    "location_address" TEXT,
    "location_city" TEXT,
    "location_country" TEXT,
    "location_lat" DECIMAL(10,8),
    "location_lng" DECIMAL(11,8),
    "virtual_link" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "EventVisibility" NOT NULL DEFAULT 'PUBLIC',
    "max_resale_price" DECIMAL(18,7),
    "royalty_bps" INTEGER NOT NULL DEFAULT 500,
    "refund_policy" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "on_chain_event_id" BIGINT,
    "stake_required" DECIMAL(18,7) NOT NULL DEFAULT 0,
    "total_tickets" INTEGER NOT NULL DEFAULT 0,
    "tickets_sold" INTEGER NOT NULL DEFAULT 0,
    "total_revenue" DECIMAL(18,7) NOT NULL DEFAULT 0,
    "checked_in_count" INTEGER NOT NULL DEFAULT 0,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "trending_score" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_tiers" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(18,7) NOT NULL,
    "price_asset" TEXT NOT NULL DEFAULT 'XLM',
    "total_supply" INTEGER NOT NULL,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_transferable" BOOLEAN NOT NULL DEFAULT true,
    "max_per_wallet" INTEGER NOT NULL DEFAULT 10,
    "sale_starts_at" TIMESTAMP(3),
    "sale_ends_at" TIMESTAMP(3),
    "perks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "badge_type" "BadgeType" NOT NULL DEFAULT 'ATTENDEE',
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "tier_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "owner_wallet" TEXT NOT NULL,
    "ticket_number" INTEGER NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'PENDING',
    "on_chain_token_id" BIGINT,
    "metadata_ipfs_cid" TEXT,
    "purchase_price" DECIMAL(18,7) NOT NULL,
    "purchase_asset" TEXT NOT NULL,
    "purchase_tx_hash" TEXT,
    "mint_tx_hash" TEXT,
    "qr_payload_hash" TEXT,
    "is_resale" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_ins" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scanned_by" TEXT NOT NULL,
    "qr_nonce" TEXT NOT NULL,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "device_info" TEXT,
    "is_online" BOOLEAN NOT NULL DEFAULT true,
    "badge_minted" BOOLEAN NOT NULL DEFAULT false,
    "badge_id" TEXT,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_badges" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "owner_wallet" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "badge_type" "BadgeType" NOT NULL,
    "on_chain_token_id" BIGINT,
    "metadata_ipfs_cid" TEXT,
    "mint_tx_hash" TEXT,
    "mint_status" "MintStatus" NOT NULL DEFAULT 'PENDING',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizer_stakes" (
    "id" TEXT NOT NULL,
    "organizer_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "amount" DECIMAL(18,7) NOT NULL,
    "asset" TEXT NOT NULL,
    "status" "StakeStatus" NOT NULL DEFAULT 'PENDING',
    "stake_tx_hash" TEXT,
    "release_tx_hash" TEXT,
    "slash_tx_hash" TEXT,
    "slash_percentage" INTEGER,
    "slash_recipient" TEXT,
    "slash_reason" TEXT,
    "staked_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "release_after" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizer_stakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_listings" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "seller_wallet" TEXT NOT NULL,
    "price" DECIMAL(18,7) NOT NULL,
    "asset" TEXT NOT NULL,
    "royalty_bps" INTEGER NOT NULL,
    "royalty_recipient" TEXT NOT NULL,
    "max_price" DECIMAL(18,7),
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "list_tx_hash" TEXT,
    "sale_tx_hash" TEXT,
    "buyer_wallet" TEXT,
    "buyer_id" TEXT,
    "sale_price" DECIMAL(18,7),
    "royalty_paid" DECIMAL(18,7),
    "listed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sold_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "marketplace_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reputation_history" (
    "id" TEXT NOT NULL,
    "organizer_id" TEXT NOT NULL,
    "event_id" TEXT,
    "score_before" INTEGER NOT NULL,
    "score_after" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reputation_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_ratings" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "review" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_wallet_address_idx" ON "users"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_jti_key" ON "sessions"("jti");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_jti_idx" ON "sessions"("jti");

-- CreateIndex
CREATE UNIQUE INDEX "organizer_profiles_user_id_key" ON "organizer_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizer_profiles_wallet_address_key" ON "organizer_profiles"("wallet_address");

-- CreateIndex
CREATE INDEX "organizer_profiles_trust_tier_idx" ON "organizer_profiles"("trust_tier");

-- CreateIndex
CREATE INDEX "organizer_profiles_reputation_score_idx" ON "organizer_profiles"("reputation_score");

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE INDEX "events_status_visibility_starts_at_idx" ON "events"("status", "visibility", "starts_at");

-- CreateIndex
CREATE INDEX "events_organizer_id_idx" ON "events"("organizer_id");

-- CreateIndex
CREATE INDEX "events_category_idx" ON "events"("category");

-- CreateIndex
CREATE INDEX "events_slug_idx" ON "events"("slug");

-- CreateIndex
CREATE INDEX "ticket_tiers_event_id_idx" ON "ticket_tiers"("event_id");

-- CreateIndex
CREATE INDEX "tickets_owner_id_idx" ON "tickets"("owner_id");

-- CreateIndex
CREATE INDEX "tickets_event_id_idx" ON "tickets"("event_id");

-- CreateIndex
CREATE INDEX "tickets_owner_wallet_idx" ON "tickets"("owner_wallet");

-- CreateIndex
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_event_id_ticket_number_key" ON "tickets"("event_id", "ticket_number");

-- CreateIndex
CREATE UNIQUE INDEX "check_ins_ticket_id_key" ON "check_ins"("ticket_id");

-- CreateIndex
CREATE INDEX "check_ins_event_id_checked_in_at_idx" ON "check_ins"("event_id", "checked_in_at");

-- CreateIndex
CREATE INDEX "check_ins_user_id_idx" ON "check_ins"("user_id");

-- CreateIndex
CREATE INDEX "attendance_badges_user_id_idx" ON "attendance_badges"("user_id");

-- CreateIndex
CREATE INDEX "attendance_badges_event_id_idx" ON "attendance_badges"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_badges_user_id_event_id_badge_type_key" ON "attendance_badges"("user_id", "event_id", "badge_type");

-- CreateIndex
CREATE UNIQUE INDEX "organizer_stakes_event_id_key" ON "organizer_stakes"("event_id");

-- CreateIndex
CREATE INDEX "organizer_stakes_organizer_id_idx" ON "organizer_stakes"("organizer_id");

-- CreateIndex
CREATE INDEX "organizer_stakes_status_idx" ON "organizer_stakes"("status");

-- CreateIndex
CREATE INDEX "marketplace_listings_status_event_id_idx" ON "marketplace_listings"("status", "event_id");

-- CreateIndex
CREATE INDEX "marketplace_listings_seller_id_idx" ON "marketplace_listings"("seller_id");

-- CreateIndex
CREATE INDEX "marketplace_listings_ticket_id_idx" ON "marketplace_listings"("ticket_id");

-- CreateIndex
CREATE INDEX "reputation_history_organizer_id_created_at_idx" ON "reputation_history"("organizer_id", "created_at");

-- CreateIndex
CREATE INDEX "event_ratings_event_id_idx" ON "event_ratings"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_ratings_event_id_user_id_key" ON "event_ratings"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_profiles" ADD CONSTRAINT "organizer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "organizer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_tiers" ADD CONSTRAINT "ticket_tiers_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "ticket_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_badges" ADD CONSTRAINT "attendance_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_badges" ADD CONSTRAINT "attendance_badges_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_stakes" ADD CONSTRAINT "organizer_stakes_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "organizer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_stakes" ADD CONSTRAINT "organizer_stakes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reputation_history" ADD CONSTRAINT "reputation_history_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "organizer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_ratings" ADD CONSTRAINT "event_ratings_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_ratings" ADD CONSTRAINT "event_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
