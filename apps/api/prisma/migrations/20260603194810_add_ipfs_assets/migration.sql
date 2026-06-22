-- CreateTable
CREATE TABLE "ipfs_assets" (
    "id" TEXT NOT NULL,
    "cid" TEXT NOT NULL,
    "filename" TEXT,
    "mime_type" TEXT,
    "size_bytes" BIGINT,
    "pin_status" TEXT NOT NULL DEFAULT 'pinned',
    "uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ipfs_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ipfs_assets_cid_key" ON "ipfs_assets"("cid");

-- CreateIndex
CREATE INDEX "ipfs_assets_cid_idx" ON "ipfs_assets"("cid");
