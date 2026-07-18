-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'Provider', 'ADMIN', 'SALON');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('M', 'F', 'NB', 'prefer_not_to_say');

-- CreateEnum
CREATE TYPE "QualificationType" AS ENUM ('MAKEUP_ARTIST', 'HAIR_STYLIST', 'ESTHETICIAN', 'NAIL_TECH', 'MEHENDI_ARTIST', 'MASSAGE_THERAPIST', 'COSMETOLOGIST', 'Other');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'ON_MY_WAY', 'STARTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UrgencyLevel" AS ENUM ('routine', 'urgent', 'emergency');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'PAID', 'RELEASED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentEntityType" AS ENUM ('Provider', 'CUSTOMER', 'BOOKING', 'GENERAL');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('police_check', 'provider_certificate', 'first_aid_cert', 'driver_license', 'insurance', 'id_proof', 'photo', 'resume', 'other');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('PROVIDER_APPROVED', 'PROVIDER_REJECTED', 'DOCUMENT_APPROVED', 'DOCUMENT_REJECTED', 'BOOKING_CANCELLED', 'PAYMENT_RELEASED', 'SETTINGS_CHANGED', 'ADMIN_LOGIN', 'ADMIN_LOGOUT');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('ETRANSFER', 'STRIPE', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "gender" "Gender",
    "preferredLanguage" TEXT NOT NULL DEFAULT 'English',
    "dateOfBirth" TIMESTAMP(3),
    "lat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lng" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "photoUrl" TEXT NOT NULL DEFAULT '',
    "expoPushToken" TEXT NOT NULL DEFAULT '',
    "onboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "qualificationType" "QualificationType" NOT NULL DEFAULT 'COSMETOLOGIST',
    "licenseNumber" TEXT NOT NULL DEFAULT '',
    "collegeName" TEXT NOT NULL DEFAULT '',
    "certifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "experienceYears" INTEGER NOT NULL DEFAULT 0,
    "submittedDocuments" JSONB NOT NULL DEFAULT '[]',
    "availability" BOOLEAN NOT NULL DEFAULT true,
    "publicProfile" BOOLEAN NOT NULL DEFAULT true,
    "approvedByAdmin" BOOLEAN NOT NULL DEFAULT false,
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "languages" TEXT[] DEFAULT ARRAY['English']::TEXT[],
    "photoUrl" TEXT NOT NULL DEFAULT '',
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "policeCheckCleared" BOOLEAN NOT NULL DEFAULT false,
    "firstAidCertified" BOOLEAN NOT NULL DEFAULT false,
    "driversLicense" BOOLEAN NOT NULL DEFAULT false,
    "ownTransportation" BOOLEAN NOT NULL DEFAULT false,
    "insuranceVerified" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT NOT NULL DEFAULT 'Beauty',
    "homeService" BOOLEAN NOT NULL DEFAULT true,
    "salonService" BOOLEAN NOT NULL DEFAULT false,
    "salonAddress" TEXT NOT NULL DEFAULT '',
    "serviceRadiusKm" INTEGER NOT NULL DEFAULT 10,
    "coverPhotoUrl" TEXT NOT NULL DEFAULT '',
    "walletWithdrawn" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payoutEmail" TEXT NOT NULL DEFAULT '',
    "payoutMethod" "PayoutMethod" NOT NULL DEFAULT 'ETRANSFER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerId" TEXT,
    "serviceType" TEXT NOT NULL,
    "hours" INTEGER NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'REQUESTED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "price" DECIMAL(10,2) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "ratingGiven" BOOLEAN NOT NULL DEFAULT false,
    "cancelledBy" TEXT,
    "recipientName" TEXT NOT NULL DEFAULT '',
    "urgency" "UrgencyLevel" NOT NULL DEFAULT 'routine',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "stripePaymentIntentId" TEXT,
    "platformFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "providerPayout" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "providerLocationLat" DOUBLE PRECISION,
    "providerLocationLng" DOUBLE PRECISION,
    "providerLocationUpdatedAt" TIMESTAMP(3),
    "providerRequestedAt" TIMESTAMP(3),
    "openToPool" BOOLEAN NOT NULL DEFAULT false,
    "serviceNotes" TEXT NOT NULL DEFAULT '',
    "providerArrivingAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "tipAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tipPaymentIntentId" TEXT,
    "tipPaid" BOOLEAN NOT NULL DEFAULT false,
    "ratingValue" DECIMAL(3,2),
    "ratingComment" TEXT NOT NULL DEFAULT '',
    "providerRatingGiven" BOOLEAN NOT NULL DEFAULT false,
    "providerRatingValue" DECIMAL(3,2),
    "providerRatingComment" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "entityType" "DocumentEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "docType" "DocType" NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "dataUrl" TEXT NOT NULL DEFAULT '',
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "email" TEXT,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "canApproveProvider" BOOLEAN NOT NULL DEFAULT true,
    "canVerifyDocuments" BOOLEAN NOT NULL DEFAULT true,
    "canManageBookings" BOOLEAN NOT NULL DEFAULT true,
    "canViewAnalytics" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OTP" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastGeneratedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OTP_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "serviceType" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'landing',
    "contacted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderApplicant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "qualificationType" TEXT NOT NULL DEFAULT '',
    "experienceYears" INTEGER NOT NULL DEFAULT 0,
    "hasPoliceCheck" BOOLEAN NOT NULL DEFAULT false,
    "hasFirstAid" BOOLEAN NOT NULL DEFAULT false,
    "hasReliableTransport" BOOLEAN NOT NULL DEFAULT false,
    "availability" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'landing',
    "screenResult" TEXT NOT NULL DEFAULT 'review',
    "contacted" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderApplicant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "bookingIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "method" "PayoutMethod" NOT NULL DEFAULT 'ETRANSFER',
    "adminNote" TEXT NOT NULL DEFAULT '',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'booking',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "bookingId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT '',
    "basePrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderService" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "serviceItemId" TEXT,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_role_isVerified_idx" ON "User"("role", "isVerified");

-- CreateIndex
CREATE INDEX "User_role_createdAt_idx" ON "User"("role", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "User_rating_idx" ON "User"("rating" DESC);

-- CreateIndex
CREATE INDEX "User_lat_lng_idx" ON "User"("lat", "lng");

-- CreateIndex
CREATE INDEX "User_role_lat_lng_idx" ON "User"("role", "lat", "lng");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "User_lastSeenAt_idx" ON "User"("lastSeenAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderProfile_userId_key" ON "ProviderProfile"("userId");

-- CreateIndex
CREATE INDEX "ProviderProfile_approvedByAdmin_availability_idx" ON "ProviderProfile"("approvedByAdmin", "availability");

-- CreateIndex
CREATE INDEX "ProviderProfile_approvedByAdmin_availability_userId_idx" ON "ProviderProfile"("approvedByAdmin", "availability", "userId");

-- CreateIndex
CREATE INDEX "ProviderProfile_qualificationType_idx" ON "ProviderProfile"("qualificationType");

-- CreateIndex
CREATE INDEX "ProviderProfile_policeCheckCleared_idx" ON "ProviderProfile"("policeCheckCleared");

-- CreateIndex
CREATE INDEX "ProviderProfile_experienceYears_idx" ON "ProviderProfile"("experienceYears" DESC);

-- CreateIndex
CREATE INDEX "ProviderProfile_createdAt_idx" ON "ProviderProfile"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Booking_customerId_status_idx" ON "Booking"("customerId", "status");

-- CreateIndex
CREATE INDEX "Booking_providerId_status_idx" ON "Booking"("providerId", "status");

-- CreateIndex
CREATE INDEX "Booking_status_scheduledAt_idx" ON "Booking"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Booking_paymentStatus_idx" ON "Booking"("paymentStatus");

-- CreateIndex
CREATE INDEX "Booking_createdAt_idx" ON "Booking"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Booking_scheduledAt_idx" ON "Booking"("scheduledAt");

-- CreateIndex
CREATE INDEX "Booking_updatedAt_idx" ON "Booking"("updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Booking_providerId_scheduledAt_status_idx" ON "Booking"("providerId", "scheduledAt", "status");

-- CreateIndex
CREATE INDEX "Booking_customerId_scheduledAt_idx" ON "Booking"("customerId", "scheduledAt" DESC);

-- CreateIndex
CREATE INDEX "Booking_openToPool_status_scheduledAt_idx" ON "Booking"("openToPool", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Booking_status_openToPool_idx" ON "Booking"("status", "openToPool");

-- CreateIndex
CREATE INDEX "Document_entityType_entityId_idx" ON "Document"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Document_entityId_status_idx" ON "Document"("entityId", "status");

-- CreateIndex
CREATE INDEX "Document_entityType_docType_status_idx" ON "Document"("entityType", "docType", "status");

-- CreateIndex
CREATE INDEX "Document_status_submittedAt_idx" ON "Document"("status", "submittedAt" DESC);

-- CreateIndex
CREATE INDEX "Document_isActive_status_submittedAt_idx" ON "Document"("isActive", "status", "submittedAt" DESC);

-- CreateIndex
CREATE INDEX "Document_reviewedBy_idx" ON "Document"("reviewedBy");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE INDEX "AuditLog_adminId_createdAt_idx" ON "AuditLog"("adminId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Message_bookingId_createdAt_idx" ON "Message"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderId_read_idx" ON "Message"("senderId", "read");

-- CreateIndex
CREATE INDEX "Message_bookingId_senderId_read_idx" ON "Message"("bookingId", "senderId", "read");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "OTP_phone_key" ON "OTP"("phone");

-- CreateIndex
CREATE INDEX "OTP_phone_idx" ON "OTP"("phone");

-- CreateIndex
CREATE INDEX "OTP_expiresAt_idx" ON "OTP"("expiresAt");

-- CreateIndex
CREATE INDEX "Lead_contacted_createdAt_idx" ON "Lead"("contacted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "ProviderApplicant_status_createdAt_idx" ON "ProviderApplicant"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ProviderApplicant_screenResult_createdAt_idx" ON "ProviderApplicant"("screenResult", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ProviderApplicant_createdAt_idx" ON "ProviderApplicant"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderApplicant_phone_key" ON "ProviderApplicant"("phone");

-- CreateIndex
CREATE INDEX "Payout_providerId_idx" ON "Payout"("providerId");

-- CreateIndex
CREATE INDEX "Payout_providerId_status_idx" ON "Payout"("providerId", "status");

-- CreateIndex
CREATE INDEX "Payout_status_createdAt_idx" ON "Payout"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_bookingId_idx" ON "Notification"("bookingId");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCategory_name_key" ON "ServiceCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCategory_slug_key" ON "ServiceCategory"("slug");

-- CreateIndex
CREATE INDEX "ServiceItem_categoryId_active_sortOrder_idx" ON "ServiceItem"("categoryId", "active", "sortOrder");

-- CreateIndex
CREATE INDEX "ServiceItem_popular_active_idx" ON "ServiceItem"("popular", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceItem_categoryId_name_key" ON "ServiceItem"("categoryId", "name");

-- CreateIndex
CREATE INDEX "ProviderService_profileId_active_idx" ON "ProviderService"("profileId", "active");

-- CreateIndex
CREATE INDEX "ProviderService_serviceItemId_idx" ON "ProviderService"("serviceItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderService_profileId_name_key" ON "ProviderService"("profileId", "name");

-- AddForeignKey
ALTER TABLE "ProviderProfile" ADD CONSTRAINT "ProviderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItem" ADD CONSTRAINT "ServiceItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderService" ADD CONSTRAINT "ProviderService_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderService" ADD CONSTRAINT "ProviderService_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

