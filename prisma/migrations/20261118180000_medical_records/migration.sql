-- Ramo do negócio e prontuário ligado/desligado
ALTER TABLE "Company" ADD COLUMN "segment" TEXT;
ALTER TABLE "Company" ADD COLUMN "medicalRecordsMode" TEXT;

-- Evoluções do prontuário (nunca apagadas; retificação cria outra)
CREATE TABLE "ClinicalNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "professionalId" TEXT,
    "text" TEXT NOT NULL,
    "amendsId" TEXT,
    "authorUserId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClinicalNote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClinicalNote_amendsId_key" ON "ClinicalNote"("amendsId");
CREATE INDEX "ClinicalNote_companyId_clientId_createdAt_idx" ON "ClinicalNote"("companyId", "clientId", "createdAt");
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_amendsId_fkey" FOREIGN KEY ("amendsId") REFERENCES "ClinicalNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
