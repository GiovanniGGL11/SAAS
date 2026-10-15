-- CreateEnum
CREATE TYPE "ClientPackageStatus" AS ENUM ('ACTIVE', 'CANCELED');

-- CreateEnum
CREATE TYPE "GiftCardStatus" AS ENUM ('ACTIVE', 'CANCELED');

-- CreateEnum
CREATE TYPE "AppointmentCreditKind" AS ENUM ('PACKAGE', 'GIFT_CARD');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "clientId" TEXT;

-- CreateTable
CREATE TABLE "PackagePlan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "validityDays" INTEGER,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackagePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPackage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "sessionsTotal" INTEGER NOT NULL,
    "sessionsUsed" INTEGER NOT NULL DEFAULT 0,
    "sessionValue" DECIMAL(10,2) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "periodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodEnd" TIMESTAMP(3),
    "status" "ClientPackageStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "initialAmount" DECIMAL(10,2) NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL,
    "buyerName" TEXT,
    "recipientName" TEXT,
    "clientId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "status" "GiftCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentCredit" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "kind" "AppointmentCreditKind" NOT NULL,
    "clientPackageId" TEXT,
    "giftCardId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackagePlan_companyId_active_idx" ON "PackagePlan"("companyId", "active");

-- CreateIndex
CREATE INDEX "ClientPackage_companyId_clientId_status_idx" ON "ClientPackage"("companyId", "clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_companyId_code_key" ON "GiftCard"("companyId", "code");

-- CreateIndex
CREATE INDEX "AppointmentCredit_appointmentId_idx" ON "AppointmentCredit"("appointmentId");

-- CreateIndex
CREATE INDEX "Transaction_companyId_clientId_status_idx" ON "Transaction"("companyId", "clientId", "status");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePlan" ADD CONSTRAINT "PackagePlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePlan" ADD CONSTRAINT "PackagePlan_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPackage" ADD CONSTRAINT "ClientPackage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPackage" ADD CONSTRAINT "ClientPackage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPackage" ADD CONSTRAINT "ClientPackage_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PackagePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPackage" ADD CONSTRAINT "ClientPackage_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentCredit" ADD CONSTRAINT "AppointmentCredit_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentCredit" ADD CONSTRAINT "AppointmentCredit_clientPackageId_fkey" FOREIGN KEY ("clientPackageId") REFERENCES "ClientPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentCredit" ADD CONSTRAINT "AppointmentCredit_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

