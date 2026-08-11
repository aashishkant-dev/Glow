-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "capableLooks" TEXT[] DEFAULT ARRAY[]::TEXT[];
