-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY';

-- AlterTable
ALTER TABLE "WhatsappMessage" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'zapi';

