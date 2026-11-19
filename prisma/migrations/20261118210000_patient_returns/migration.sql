-- Retorno do paciente: envio automático e o que já foi tratado
ALTER TABLE "Company" ADD COLUMN "waAutoReturn" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ReturnContact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "lastVisitAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'manual',
    "snoozeUntil" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReturnContact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReturnContact_companyId_clientId_serviceId_lastVisitAt_key" ON "ReturnContact"("companyId", "clientId", "serviceId", "lastVisitAt");
CREATE INDEX "ReturnContact_companyId_status_idx" ON "ReturnContact"("companyId", "status");
ALTER TABLE "ReturnContact" ADD CONSTRAINT "ReturnContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
