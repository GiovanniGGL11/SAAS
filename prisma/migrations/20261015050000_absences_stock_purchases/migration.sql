-- AlterTable
ALTER TABLE "ScheduleBlock" ADD COLUMN     "seriesId" TEXT;

-- CreateTable
CREATE TABLE "StockPurchase" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplier" TEXT,
    "invoiceNumber" TEXT,
    "total" DECIMAL(10,2) NOT NULL,
    "transactionId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockPurchaseItem" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "StockPurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockPurchase_companyId_createdAt_idx" ON "StockPurchase"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ScheduleBlock_seriesId_idx" ON "ScheduleBlock"("seriesId");

-- AddForeignKey
ALTER TABLE "StockPurchase" ADD CONSTRAINT "StockPurchase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPurchaseItem" ADD CONSTRAINT "StockPurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "StockPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPurchaseItem" ADD CONSTRAINT "StockPurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

