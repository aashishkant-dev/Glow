-- AlterTable
ALTER TABLE "SkinScan" ADD COLUMN     "hydrationLevel" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "zoneNotes" JSONB NOT NULL DEFAULT '{}';
