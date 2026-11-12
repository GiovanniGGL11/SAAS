-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "trialPending" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TrialClaim" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "valueHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrialClaim_kind_valueHash_idx" ON "TrialClaim"("kind", "valueHash");

-- CreateIndex
CREATE INDEX "TrialClaim_companyId_idx" ON "TrialClaim"("companyId");

-- AddForeignKey
ALTER TABLE "TrialClaim" ADD CONSTRAINT "TrialClaim_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

