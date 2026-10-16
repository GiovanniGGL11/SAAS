-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "asaasApiKey" TEXT,
ADD COLUMN     "depositHoldMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "depositPercent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "depositAmount" DECIMAL(10,2),
ADD COLUMN     "depositExpiresAt" TIMESTAMP(3),
ADD COLUMN     "depositPaymentId" TEXT,
ADD COLUMN     "depositStatus" "DepositStatus";

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_depositPaymentId_key" ON "Appointment"("depositPaymentId");

