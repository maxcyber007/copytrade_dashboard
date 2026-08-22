-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "StrategyOwnerType" AS ENUM ('PLATFORM', 'PROVIDER');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED');

-- AlterTable
ALTER TABLE "Strategy" ADD COLUMN     "ownerType" "StrategyOwnerType" NOT NULL DEFAULT 'PLATFORM',
ADD COLUMN     "providerId" TEXT;

-- CreateTable
CREATE TABLE "ProviderProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "website" TEXT,
    "country" TEXT,
    "yearsTrading" INTEGER,
    "status" "ProviderStatus" NOT NULL DEFAULT 'PENDING',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "publicReason" TEXT,
    "performanceFeePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "subscriptionPriceMonthly" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "payoutMethod" TEXT,
    "encryptedPayoutDetails" TEXT,
    "totalStrategies" INTEGER NOT NULL DEFAULT 0,
    "totalSubscribers" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderPayout" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "grossAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "feeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyApiKey" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Master EA',
    "keyId" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderProfile_userId_key" ON "ProviderProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderProfile_displayName_key" ON "ProviderProfile"("displayName");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderProfile_slug_key" ON "ProviderProfile"("slug");

-- CreateIndex
CREATE INDEX "ProviderProfile_status_idx" ON "ProviderProfile"("status");

-- CreateIndex
CREATE INDEX "ProviderProfile_createdAt_idx" ON "ProviderProfile"("createdAt");

-- CreateIndex
CREATE INDEX "ProviderPayout_status_idx" ON "ProviderPayout"("status");

-- CreateIndex
CREATE INDEX "ProviderPayout_createdAt_idx" ON "ProviderPayout"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderPayout_providerId_periodStart_periodEnd_key" ON "ProviderPayout"("providerId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyApiKey_keyId_key" ON "StrategyApiKey"("keyId");

-- CreateIndex
CREATE INDEX "StrategyApiKey_strategyId_idx" ON "StrategyApiKey"("strategyId");

-- CreateIndex
CREATE INDEX "StrategyApiKey_revokedAt_idx" ON "StrategyApiKey"("revokedAt");

-- CreateIndex
CREATE INDEX "Strategy_providerId_idx" ON "Strategy"("providerId");

-- CreateIndex
CREATE INDEX "Strategy_ownerType_idx" ON "Strategy"("ownerType");

-- AddForeignKey
ALTER TABLE "ProviderProfile" ADD CONSTRAINT "ProviderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderProfile" ADD CONSTRAINT "ProviderProfile_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderPayout" ADD CONSTRAINT "ProviderPayout_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyApiKey" ADD CONSTRAINT "StrategyApiKey_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
