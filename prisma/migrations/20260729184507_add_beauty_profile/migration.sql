-- CreateEnum
CREATE TYPE "SkinTone" AS ENUM ('FAIR', 'LIGHT', 'MEDIUM', 'TAN', 'DEEP', 'RICH');

-- CreateEnum
CREATE TYPE "SkinType" AS ENUM ('DRY', 'OILY', 'COMBINATION', 'NORMAL', 'SENSITIVE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "preferredOccasions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "skinTone" "SkinTone",
ADD COLUMN     "skinType" "SkinType";

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Favorite_customerId_idx" ON "Favorite"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_customerId_providerId_key" ON "Favorite"("customerId", "providerId");

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
