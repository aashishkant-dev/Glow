-- CreateTable
CREATE TABLE "BookingSkip" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingSkip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingSkip_providerId_idx" ON "BookingSkip"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingSkip_bookingId_providerId_key" ON "BookingSkip"("bookingId", "providerId");

-- AddForeignKey
ALTER TABLE "BookingSkip" ADD CONSTRAINT "BookingSkip_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSkip" ADD CONSTRAINT "BookingSkip_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
