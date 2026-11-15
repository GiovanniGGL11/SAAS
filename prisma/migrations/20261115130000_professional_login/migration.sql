-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Professional_companyId_userId_key" ON "Professional"("companyId", "userId");
