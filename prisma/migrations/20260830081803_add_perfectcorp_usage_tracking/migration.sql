-- AlterTable
ALTER TABLE "SkinScan" ADD COLUMN     "heatmapSource" TEXT NOT NULL DEFAULT 'estimated',
ADD COLUMN     "heatmapSourceReason" TEXT;

-- CreateTable
CREATE TABLE "ApiUsageLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "statusCode" INTEGER,
    "errorCode" TEXT,
    "durationMs" INTEGER,
    "scanId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiUsageLog_provider_createdAt_idx" ON "ApiUsageLog"("provider", "createdAt" DESC);
