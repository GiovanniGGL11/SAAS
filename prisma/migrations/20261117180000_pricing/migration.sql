-- Custo unitário gravado em cada movimento de estoque (base do CMV/CSP do DRE gerencial)
ALTER TABLE "StockMovement" ADD COLUMN "unitCost" DECIMAL(10,2);
ALTER TABLE "StockMovement" ADD COLUMN "unitPrice" DECIMAL(10,2);

-- O banco grava o custo do produto no momento do movimento, quando o código não informar
CREATE OR REPLACE FUNCTION stock_movement_unit_cost() RETURNS trigger AS $$
BEGIN
  IF NEW."unitCost" IS NULL THEN
    SELECT "costPrice" INTO NEW."unitCost" FROM "Product" WHERE id = NEW."productId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stock_movement_unit_cost ON "StockMovement";
CREATE TRIGGER stock_movement_unit_cost BEFORE INSERT ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION stock_movement_unit_cost();

-- Desconto dado na comanda
ALTER TABLE "Appointment" ADD COLUMN "discountAmount" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "PricingProfile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "useRecurringExpenses" BOOLEAN NOT NULL DEFAULT true,
    "extraFixedMonthly" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ownerWithdrawal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "availableHours" DECIMAL(8,2) NOT NULL DEFAULT 160,
    "occupancyPercent" DECIMAL(5,2) NOT NULL DEFAULT 75,
    "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "targetMarginPercent" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "defaultPaymentMethod" "PaymentMethod",
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PricingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingSimulation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "serviceId" TEXT,
    "productId" TEXT,
    "inputs" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PricingSimulation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PricingProfile_companyId_key" ON "PricingProfile"("companyId");
CREATE INDEX "PricingSimulation_companyId_createdAt_idx" ON "PricingSimulation"("companyId", "createdAt");

ALTER TABLE "PricingProfile" ADD CONSTRAINT "PricingProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PricingSimulation" ADD CONSTRAINT "PricingSimulation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
