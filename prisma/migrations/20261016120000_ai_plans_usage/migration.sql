-- CreateEnum
CREATE TYPE "AiAutonomyMode" AS ENUM ('SUGGEST', 'APPROVAL', 'AUTO_RULES');

-- CreateEnum
CREATE TYPE "AiReservationStatus" AS ENUM ('ACTIVE', 'SETTLED', 'RELEASED');

-- CreateEnum
CREATE TYPE "AiUsageOutcome" AS ENUM ('SUCCEEDED', 'FAILED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AiProposalStatus" AS ENUM ('PROPOSED', 'AWAITING_APPROVAL', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AiAuthorizationStatus" AS ENUM ('ACTIVE', 'PAUSED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AddOnStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "AddOnIntegrationStatus" AS ENUM ('NOT_CONFIGURED', 'CONNECTED', 'ERROR');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "aiAutonomyMode" "AiAutonomyMode" NOT NULL DEFAULT 'APPROVAL';

-- CreateTable
CREATE TABLE "AiUsagePeriod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "usedUnits" INTEGER NOT NULL DEFAULT 0,
    "audioSeconds" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUsagePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageReservation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "feature" TEXT NOT NULL,
    "status" "AiReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "otherUsage" JSONB,
    "audioSeconds" INTEGER,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "units" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostMicros" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "outcome" "AiUsageOutcome" NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiActionProposal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "summaryHash" TEXT NOT NULL,
    "status" "AiProposalStatus" NOT NULL DEFAULT 'AWAITING_APPROVAL',
    "origin" TEXT NOT NULL DEFAULT 'assistant',
    "authorizationId" TEXT,
    "resultMessage" TEXT,
    "errorMessage" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiActionProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiTaskAuthorization" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "status" "AiAuthorizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "scope" JSONB,
    "limits" JSONB,
    "pausedReason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiTaskAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAddOn" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "addOnId" TEXT NOT NULL,
    "status" "AddOnStatus" NOT NULL DEFAULT 'INACTIVE',
    "integrationStatus" "AddOnIntegrationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "monthlyQuota" INTEGER,
    "spendLimitCents" INTEGER,
    "sendRules" JSONB,
    "activatedAt" TIMESTAMP(3),
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyAddOn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiUsagePeriod_companyId_period_key" ON "AiUsagePeriod"("companyId", "period");

-- CreateIndex
CREATE INDEX "AiUsageReservation_companyId_period_status_idx" ON "AiUsageReservation"("companyId", "period", "status");

-- CreateIndex
CREATE INDEX "AiUsageEvent_companyId_createdAt_idx" ON "AiUsageEvent"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AiActionProposal_companyId_userId_status_idx" ON "AiActionProposal"("companyId", "userId", "status");

-- CreateIndex
CREATE INDEX "AiTaskAuthorization_companyId_status_idx" ON "AiTaskAuthorization"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyAddOn_companyId_addOnId_key" ON "CompanyAddOn"("companyId", "addOnId");

-- AddForeignKey
ALTER TABLE "AiUsagePeriod" ADD CONSTRAINT "AiUsagePeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageReservation" ADD CONSTRAINT "AiUsageReservation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiActionProposal" ADD CONSTRAINT "AiActionProposal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiTaskAuthorization" ADD CONSTRAINT "AiTaskAuthorization_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAddOn" ADD CONSTRAINT "CompanyAddOn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

