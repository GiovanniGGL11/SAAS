-- CreateTable
CREATE TABLE "PeriodGoal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "target" DECIMAL(12,2) NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeriodGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PeriodGoal_companyId_month_idx" ON "PeriodGoal"("companyId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodGoal_companyId_metric_month_key" ON "PeriodGoal"("companyId", "metric", "month");

-- AddForeignKey
ALTER TABLE "PeriodGoal" ADD CONSTRAINT "PeriodGoal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

