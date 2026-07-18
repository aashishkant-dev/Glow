-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('PER_SERVICE', 'HOURLY');

-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN "pricingModel" "PricingModel" NOT NULL DEFAULT 'HOURLY';
ALTER TABLE "ProviderProfile" ADD COLUMN "hourlyRate" DECIMAL(10,2);
ALTER TABLE "ProviderProfile" ADD COLUMN "priceNegotiable" BOOLEAN NOT NULL DEFAULT false;
