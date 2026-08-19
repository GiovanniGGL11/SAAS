-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('FIXED', 'PERCENTAGE');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "isVip" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "commissionType" "CommissionType",
ADD COLUMN     "commissionValue" DECIMAL(10,2),
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "category" TEXT,
ADD COLUMN     "description" TEXT;
