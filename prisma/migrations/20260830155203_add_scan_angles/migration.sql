-- AlterTable
ALTER TABLE "SkinScan" ADD COLUMN     "parentScanId" TEXT;

-- CreateIndex
CREATE INDEX "SkinScan_parentScanId_idx" ON "SkinScan"("parentScanId");

-- AddForeignKey
ALTER TABLE "SkinScan" ADD CONSTRAINT "SkinScan_parentScanId_fkey" FOREIGN KEY ("parentScanId") REFERENCES "SkinScan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
