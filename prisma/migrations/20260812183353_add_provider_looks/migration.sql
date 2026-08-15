-- CreateTable
CREATE TABLE "ProviderLook" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "vibe" VARCHAR(140),
    "serviceType" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "durationMin" INTEGER,
    "includes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "photoUrl" TEXT,
    "themeFrom" TEXT,
    "themeTo" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderLook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderLook_profileId_idx" ON "ProviderLook"("profileId");

-- AddForeignKey
ALTER TABLE "ProviderLook" ADD CONSTRAINT "ProviderLook_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
