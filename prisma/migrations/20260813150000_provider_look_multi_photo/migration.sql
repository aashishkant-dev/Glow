-- AlterTable: ProviderLook.photoUrl (single) -> ProviderLook.photos (array)
ALTER TABLE "ProviderLook" ADD COLUMN     "photos" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill existing single photoUrl values into the new array column
UPDATE "ProviderLook" SET "photos" = ARRAY["photoUrl"] WHERE "photoUrl" IS NOT NULL;

ALTER TABLE "ProviderLook" DROP COLUMN "photoUrl";
