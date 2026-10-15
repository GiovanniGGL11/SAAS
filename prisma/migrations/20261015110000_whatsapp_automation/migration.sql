-- CreateEnum
CREATE TYPE "WhatsappMessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "waAutoBirthday" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "waAutoConfirm" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "waAutoReminder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "waAutoReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "zapiClientToken" TEXT,
ADD COLUMN     "zapiInstanceId" TEXT,
ADD COLUMN     "zapiToken" TEXT;

-- CreateTable
CREATE TABLE "WhatsappMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "WhatsappMessageStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "providerId" TEXT,
    "clientId" TEXT,
    "appointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsappMessage_companyId_createdAt_idx" ON "WhatsappMessage"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappMessage_companyId_dedupeKey_key" ON "WhatsappMessage"("companyId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

