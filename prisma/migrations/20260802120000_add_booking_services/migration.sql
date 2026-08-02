-- CreateTable
CREATE TABLE "BookingService" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "serviceItemId" TEXT,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingService_bookingId_idx" ON "BookingService"("bookingId");

-- CreateIndex
CREATE INDEX "BookingService_serviceItemId_idx" ON "BookingService"("serviceItemId");

-- AddForeignKey
ALTER TABLE "BookingService" ADD CONSTRAINT "BookingService_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingService" ADD CONSTRAINT "BookingService_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
