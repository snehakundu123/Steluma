-- Production hardening migration
-- Adds: purchaseBatchId on tickets, onChainListingId on listings,
--       PENDING_SALE enum value, missing indexes

-- Add purchaseBatchId to tickets for reliable purchase batch lookup
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "purchase_batch_id" TEXT;

-- Index for batch lookup (replaces fragile id LIKE prefix scan)
CREATE INDEX IF NOT EXISTS "tickets_purchase_batch_id_idx" ON "tickets"("purchase_batch_id");

-- Index for QR hash lookup
CREATE INDEX IF NOT EXISTS "tickets_qr_payload_hash_idx" ON "tickets"("qr_payload_hash");

-- Add on-chain listing ID for reliable marketplace event correlation
ALTER TABLE "marketplace_listings" ADD COLUMN IF NOT EXISTS "on_chain_listing_id" BIGINT;
CREATE INDEX IF NOT EXISTS "marketplace_listings_on_chain_listing_id_idx" ON "marketplace_listings"("on_chain_listing_id");

-- Index for expiry-based cleanup
CREATE INDEX IF NOT EXISTS "marketplace_listings_expires_at_idx" ON "marketplace_listings"("expires_at");

-- Add PENDING_SALE to ListingStatus enum
-- PostgreSQL requires special handling to add enum values
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'ListingStatus' AND e.enumlabel = 'PENDING_SALE'
  ) THEN
    ALTER TYPE "ListingStatus" ADD VALUE 'PENDING_SALE' BEFORE 'SOLD';
  END IF;
END $$;

-- Clean up orphaned auth nonces older than 10 minutes (initial cleanup)
DELETE FROM "auth_nonces" WHERE "expires_at" < NOW();
