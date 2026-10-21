-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "priceKind" TEXT NOT NULL DEFAULT 'fixed',
ADD COLUMN     "publicVisible" BOOLEAN NOT NULL DEFAULT true;

