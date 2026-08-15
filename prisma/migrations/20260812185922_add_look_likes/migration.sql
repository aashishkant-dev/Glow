-- CreateTable
CREATE TABLE "LookLike" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "lookKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LookLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LookLike_profileId_lookKey_idx" ON "LookLike"("profileId", "lookKey");

-- CreateIndex
CREATE UNIQUE INDEX "LookLike_profileId_lookKey_userId_key" ON "LookLike"("profileId", "lookKey", "userId");

-- AddForeignKey
ALTER TABLE "LookLike" ADD CONSTRAINT "LookLike_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LookLike" ADD CONSTRAINT "LookLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
