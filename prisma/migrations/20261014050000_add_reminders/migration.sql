-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "remindersByEmail" BOOLEAN NOT NULL DEFAULT false;
