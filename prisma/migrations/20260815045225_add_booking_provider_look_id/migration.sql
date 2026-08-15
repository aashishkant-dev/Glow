-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "providerLookId" TEXT;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_providerLookId_fkey" FOREIGN KEY ("providerLookId") REFERENCES "ProviderLook"("id") ON DELETE SET NULL ON UPDATE CASCADE;
