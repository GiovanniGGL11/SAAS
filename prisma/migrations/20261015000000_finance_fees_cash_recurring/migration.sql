-- CreateEnum
CREATE TYPE "CashMovementKind" AS ENUM ('WITHDRAWAL', 'DEPOSIT');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "feeAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "recurringExpenseId" TEXT,
ADD COLUMN     "recurringMonth" TEXT,
ADD COLUMN     "settlesAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PaymentMethodFee" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "feePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "settlementDays" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethodFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedByUserId" TEXT NOT NULL,
    "openingAmount" DECIMAL(10,2) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "expectedCash" DECIMAL(10,2),
    "countedCash" DECIMAL(10,2),
    "notes" TEXT,

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" "CashMovementKind" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringExpense" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "paymentMethod" "PaymentMethod",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethodFee_companyId_paymentMethod_key" ON "PaymentMethodFee"("companyId", "paymentMethod");

-- CreateIndex
CREATE INDEX "CashSession_companyId_openedAt_idx" ON "CashSession"("companyId", "openedAt");

-- CreateIndex
CREATE INDEX "CashMovement_sessionId_idx" ON "CashMovement"("sessionId");

-- CreateIndex
CREATE INDEX "RecurringExpense_companyId_active_idx" ON "RecurringExpense"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCategory_companyId_type_name_key" ON "FinanceCategory"("companyId", "type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_recurringExpenseId_recurringMonth_key" ON "Transaction"("recurringExpenseId", "recurringMonth");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethodFee" ADD CONSTRAINT "PaymentMethodFee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCategory" ADD CONSTRAINT "FinanceCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Só um caixa aberto por empresa ao mesmo tempo.
CREATE UNIQUE INDEX "CashSession_one_open_per_company" ON "CashSession"("companyId") WHERE "closedAt" IS NULL;
