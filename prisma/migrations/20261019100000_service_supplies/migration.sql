-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "appointmentId" TEXT;

-- CreateTable
CREATE TABLE "ServiceSupply" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ServiceSupply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceSupply_companyId_serviceId_idx" ON "ServiceSupply"("companyId", "serviceId");

-- CreateIndex
CREATE INDEX "ServiceSupply_productId_idx" ON "ServiceSupply"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceSupply_serviceId_productId_key" ON "ServiceSupply"("serviceId", "productId");

-- CreateIndex
CREATE INDEX "StockMovement_appointmentId_idx" ON "StockMovement"("appointmentId");

-- AddForeignKey
ALTER TABLE "ServiceSupply" ADD CONSTRAINT "ServiceSupply_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSupply" ADD CONSTRAINT "ServiceSupply_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

