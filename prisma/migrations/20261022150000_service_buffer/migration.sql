-- AlterTable
ALTER TABLE "Service" ADD COLUMN "bufferMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "bufferMinutes" INTEGER NOT NULL DEFAULT 0;
