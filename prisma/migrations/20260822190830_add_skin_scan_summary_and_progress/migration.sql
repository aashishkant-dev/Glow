-- AlterTable
ALTER TABLE "SkinScan" ADD COLUMN     "progressNote" VARCHAR(300),
ADD COLUMN     "summary" VARCHAR(300) NOT NULL DEFAULT '';
