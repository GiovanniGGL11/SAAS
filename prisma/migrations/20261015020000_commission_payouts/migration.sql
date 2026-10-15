-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "monthlyGoal" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "commissionPercent" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ProfessionalAdvance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "transactionId" TEXT,
    "payoutId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfessionalAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPayout" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "appointments" INTEGER NOT NULL,
    "baseAmount" DECIMAL(10,2) NOT NULL,
    "grossCommission" DECIMAL(10,2) NOT NULL,
    "advancesTotal" DECIMAL(10,2) NOT NULL,
    "netAmount" DECIMAL(10,2) NOT NULL,
    "transactionId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfessionalAdvance_companyId_professionalId_payoutId_idx" ON "ProfessionalAdvance"("companyId", "professionalId", "payoutId");

-- CreateIndex
CREATE INDEX "CommissionPayout_companyId_professionalId_periodStart_idx" ON "CommissionPayout"("companyId", "professionalId", "periodStart");

-- AddForeignKey
ALTER TABLE "ProfessionalAdvance" ADD CONSTRAINT "ProfessionalAdvance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalAdvance" ADD CONSTRAINT "ProfessionalAdvance_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalAdvance" ADD CONSTRAINT "ProfessionalAdvance_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "CommissionPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

