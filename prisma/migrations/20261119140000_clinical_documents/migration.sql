-- Prontuário fase 3: convênio, registro profissional, documentos e anexos
ALTER TABLE "Client" ADD COLUMN "insuranceName" TEXT;
ALTER TABLE "Client" ADD COLUMN "insuranceNumber" TEXT;
ALTER TABLE "Client" ADD COLUMN "insurancePlan" TEXT;
ALTER TABLE "Professional" ADD COLUMN "registry" TEXT;

CREATE TABLE "ClinicalDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "professionalId" TEXT,
    "professionalName" TEXT NOT NULL,
    "professionalRegistry" TEXT,
    "authorUserId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceledAt" TIMESTAMP(3),
    "canceledByName" TEXT,
    "cancelReason" TEXT,
    CONSTRAINT "ClinicalDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClinicalDocument_companyId_clientId_createdAt_idx" ON "ClinicalDocument"("companyId", "clientId", "createdAt");
ALTER TABLE "ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ClientAttachment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "uploadedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientAttachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClientAttachment_companyId_clientId_createdAt_idx" ON "ClientAttachment"("companyId", "clientId", "createdAt");
ALTER TABLE "ClientAttachment" ADD CONSTRAINT "ClientAttachment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientAttachment" ADD CONSTRAINT "ClientAttachment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
