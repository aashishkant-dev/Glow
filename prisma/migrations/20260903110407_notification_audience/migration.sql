-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "audience" TEXT;

-- CreateIndex
CREATE INDEX "Notification_userId_audience_createdAt_idx" ON "Notification"("userId", "audience", "createdAt" DESC);
