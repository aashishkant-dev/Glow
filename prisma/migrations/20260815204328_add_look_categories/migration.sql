-- AlterTable
ALTER TABLE "ProviderLook" ADD COLUMN     "categories" TEXT[] DEFAULT ARRAY[]::TEXT[];
