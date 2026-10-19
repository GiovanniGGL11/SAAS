-- AlterEnum
ALTER TYPE "AiProposalStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "AiActionProposal" ADD COLUMN     "decidedByUserId" TEXT,
ADD COLUMN     "decisionNote" TEXT;

-- CreateTable
CREATE TABLE "BusinessPreferences" (
    "companyId" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'cordial',
    "languageNotes" TEXT,
    "escalationNotes" TEXT,
    "escalateOnComplaint" BOOLEAN NOT NULL DEFAULT true,
    "escalateOnHealth" BOOLEAN NOT NULL DEFAULT true,
    "contactStartMinutes" INTEGER NOT NULL DEFAULT 480,
    "contactEndMinutes" INTEGER NOT NULL DEFAULT 1200,
    "contactWeekdays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
    "maxDiscountPercent" INTEGER,
    "approvalAboveCents" INTEGER,
    "autoSpendLimitUnits" INTEGER,
    "dailySummaryAuto" BOOLEAN NOT NULL DEFAULT false,
    "dailySummaryHour" INTEGER NOT NULL DEFAULT 7,
    "notifyQuotes" BOOLEAN NOT NULL DEFAULT true,
    "notifyTasks" BOOLEAN NOT NULL DEFAULT true,
    "notifyApprovals" BOOLEAN NOT NULL DEFAULT true,
    "automationsPaused" BOOLEAN NOT NULL DEFAULT false,
    "pausedRoutines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pausedAt" TIMESTAMP(3),
    "pausedByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessPreferences_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "optionsHash" TEXT NOT NULL,
    "fileName" TEXT,
    "status" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "report" JSONB,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "routine" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stats" JSONB,
    "note" TEXT,
    "aiUnits" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySummary" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "content" JSONB NOT NULL,
    "trigger" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailySummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportBatch_companyId_createdAt_idx" ON "ImportBatch"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_companyId_kind_fileHash_optionsHash_key" ON "ImportBatch"("companyId", "kind", "fileHash", "optionsHash");

-- CreateIndex
CREATE INDEX "AutomationRun_companyId_routine_startedAt_idx" ON "AutomationRun"("companyId", "routine", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailySummary_companyId_date_key" ON "DailySummary"("companyId", "date");

-- AddForeignKey
ALTER TABLE "BusinessPreferences" ADD CONSTRAINT "BusinessPreferences_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySummary" ADD CONSTRAINT "DailySummary_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

