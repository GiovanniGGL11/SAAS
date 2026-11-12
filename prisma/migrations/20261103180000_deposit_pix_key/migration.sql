-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "depositMethod" TEXT NOT NULL DEFAULT 'asaas',
ADD COLUMN     "pixCity" TEXT,
ADD COLUMN     "pixKey" TEXT,
ADD COLUMN     "pixKeyType" TEXT,
ADD COLUMN     "pixName" TEXT;

