-- CreateTable
CREATE TABLE "SkinProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Profile',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkinProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SkinProfile_userId_createdAt_idx" ON "SkinProfile"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "SkinProfile" ADD CONSTRAINT "SkinProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add nullable first — existing SkinScan rows need a backfilled profile before this can be required
ALTER TABLE "SkinScan" ADD COLUMN "profileId" TEXT;

-- Data migration: give every user who already has scans a single "You" profile,
-- dated to their earliest scan, and file all of their existing scans under it.
-- (No pgcrypto/gen_random_uuid dependency — this just needs a unique string,
-- not a real cuid, since Prisma's cuid() default only applies to rows the
-- Prisma client itself creates going forward.)
INSERT INTO "SkinProfile" ("id", "userId", "label", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text || "userId"), "userId", 'You', MIN("createdAt")
FROM "SkinScan"
GROUP BY "userId";

UPDATE "SkinScan" s
SET "profileId" = p."id"
FROM "SkinProfile" p
WHERE p."userId" = s."userId" AND s."profileId" IS NULL;

-- AlterTable: now safe to enforce
ALTER TABLE "SkinScan" ALTER COLUMN "profileId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "SkinScan" ADD CONSTRAINT "SkinScan_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "SkinProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "SkinScan_profileId_createdAt_idx" ON "SkinScan"("profileId", "createdAt" DESC);
