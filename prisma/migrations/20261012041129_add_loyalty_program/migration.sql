-- CreateEnum
CREATE TYPE "LoyaltyMode" AS ENUM ('STAMPS', 'POINTS', 'CASHBACK');

-- CreateEnum
CREATE TYPE "LoyaltyRewardType" AS ENUM ('FREE_SERVICE', 'PERCENT_DISCOUNT', 'FIXED_DISCOUNT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "LoyaltyEntryKind" AS ENUM ('EARN', 'REDEEM');

-- CreateTable
CREATE TABLE "LoyaltyProgram" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "mode" "LoyaltyMode" NOT NULL DEFAULT 'STAMPS',
    "stampsRequired" INTEGER NOT NULL DEFAULT 10,
    "pointsPerReal" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "pointsRequired" INTEGER NOT NULL DEFAULT 100,
    "cashbackPercent" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "rewardType" "LoyaltyRewardType" NOT NULL DEFAULT 'FREE_SERVICE',
    "rewardServiceId" TEXT,
    "rewardValue" DECIMAL(10,2),
    "rewardDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "mode" "LoyaltyMode" NOT NULL,
    "kind" "LoyaltyEntryKind" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyProgram_companyId_key" ON "LoyaltyProgram"("companyId");

-- CreateIndex
CREATE INDEX "LoyaltyEntry_companyId_clientId_mode_idx" ON "LoyaltyEntry"("companyId", "clientId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyEntry_appointmentId_kind_key" ON "LoyaltyEntry"("appointmentId", "kind");

-- AddForeignKey
ALTER TABLE "LoyaltyProgram" ADD CONSTRAINT "LoyaltyProgram_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyProgram" ADD CONSTRAINT "LoyaltyProgram_rewardServiceId_fkey" FOREIGN KEY ("rewardServiceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
