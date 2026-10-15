-- CreateEnum
CREATE TYPE "FormType" AS ENUM ('ANAMNESIS', 'ASSESSMENT', 'SERVICE_RECORD', 'CUSTOM');

-- CreateEnum
CREATE TYPE "FormTemplateStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FormFiller" AS ENUM ('PROFESSIONAL', 'CLIENT', 'BOTH');

-- CreateEnum
CREATE TYPE "FormRenewal" AS ENUM ('EACH_VISIT', 'ONCE', 'AFTER_DAYS');

-- CreateEnum
CREATE TYPE "FormRequirement" AS ENUM ('NONE', 'SUBMITTED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "FormEntryStatus" AS ENUM ('REQUESTED', 'DRAFT', 'SUBMITTED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "FormFilledBy" AS ENUM ('CLIENT', 'STAFF');

-- CreateEnum
CREATE TYPE "FormAccessScope" AS ENUM ('ALL', 'OWN');

-- CreateEnum
CREATE TYPE "PackageMovementKind" AS ENUM ('CONSUME', 'RESTORE', 'OPENING_DONE', 'EXTEND', 'ADJUST');

-- CreateEnum
CREATE TYPE "SessionRecordStatus" AS ENUM ('DRAFT', 'FINALIZED', 'AMENDED');

-- DropForeignKey
ALTER TABLE "ClientPackage" DROP CONSTRAINT "ClientPackage_planId_fkey";

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "clientPackageId" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "clientPackageId" TEXT;

-- AlterTable
ALTER TABLE "ClientPackage" ADD COLUMN     "contractedAt" TIMESTAMP(3),
ADD COLUMN     "initialFormTemplateId" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "openingPaidAmount" DECIMAL(10,2),
ADD COLUMN     "requireSignature" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "responsibleProfessionalId" TEXT,
ADD COLUMN     "sessionFormTemplateId" TEXT,
ALTER COLUMN "planId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "FormTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FormType" NOT NULL,
    "status" "FormTemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "fillableBy" "FormFiller" NOT NULL DEFAULT 'BOTH',
    "renewal" "FormRenewal" NOT NULL DEFAULT 'ONCE',
    "renewalDays" INTEGER,
    "requirement" "FormRequirement" NOT NULL DEFAULT 'NONE',
    "schema" JSONB NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormTemplateService" (
    "templateId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "FormTemplateService_pkey" PRIMARY KEY ("templateId","serviceId")
);

-- CreateTable
CREATE TABLE "FormEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "status" "FormEntryStatus" NOT NULL DEFAULT 'REQUESTED',
    "appointmentId" TEXT,
    "clientPackageId" TEXT,
    "sessionRecordId" TEXT,
    "answers" JSONB,
    "copiedFromEntryId" TEXT,
    "filledBy" "FormFilledBy",
    "filledByUserId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewNotes" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "requestKey" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormEntryRevision" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "filledBy" "FormFilledBy" NOT NULL,
    "filledByUserId" TEXT,
    "reason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormEntryRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormAccessToken" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormPermission" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT false,
    "canFill" BOOLEAN NOT NULL DEFAULT false,
    "canReview" BOOLEAN NOT NULL DEFAULT false,
    "canExport" BOOLEAN NOT NULL DEFAULT false,
    "canManage" BOOLEAN NOT NULL DEFAULT false,
    "scope" "FormAccessScope" NOT NULL DEFAULT 'ALL',
    "updatedByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientPackageId" TEXT NOT NULL,
    "kind" "PackageMovementKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "appointmentId" TEXT,
    "sessionNumber" INTEGER,
    "reason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackageMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "clientPackageId" TEXT,
    "professionalId" TEXT NOT NULL,
    "status" "SessionRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "requireSignature" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionRecordVersion" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "procedure" TEXT NOT NULL,
    "clientReport" TEXT,
    "orientations" TEXT,
    "nextReturn" TEXT,
    "internalNotes" TEXT,
    "amendmentReason" TEXT,
    "contentHash" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionRecordVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionSignature" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "collectedByUserId" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FormTemplate_companyId_status_idx" ON "FormTemplate"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FormTemplateVersion_templateId_version_key" ON "FormTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE INDEX "FormTemplateService_companyId_serviceId_idx" ON "FormTemplateService"("companyId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "FormEntry_requestKey_key" ON "FormEntry"("requestKey");

-- CreateIndex
CREATE INDEX "FormEntry_companyId_clientId_idx" ON "FormEntry"("companyId", "clientId");

-- CreateIndex
CREATE INDEX "FormEntry_companyId_status_idx" ON "FormEntry"("companyId", "status");

-- CreateIndex
CREATE INDEX "FormEntry_appointmentId_idx" ON "FormEntry"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "FormEntryRevision_entryId_revision_key" ON "FormEntryRevision"("entryId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "FormAccessToken_tokenHash_key" ON "FormAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "FormAccessToken_entryId_idx" ON "FormAccessToken"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "FormPermission_companyId_userId_key" ON "FormPermission"("companyId", "userId");

-- CreateIndex
CREATE INDEX "PackageMovement_clientPackageId_idx" ON "PackageMovement"("clientPackageId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionRecord_appointmentId_key" ON "SessionRecord"("appointmentId");

-- CreateIndex
CREATE INDEX "SessionRecord_companyId_clientId_idx" ON "SessionRecord"("companyId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionRecordVersion_recordId_version_key" ON "SessionRecordVersion"("recordId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SessionSignature_versionId_key" ON "SessionSignature"("versionId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientPackageId_fkey" FOREIGN KEY ("clientPackageId") REFERENCES "ClientPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_clientPackageId_fkey" FOREIGN KEY ("clientPackageId") REFERENCES "ClientPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPackage" ADD CONSTRAINT "ClientPackage_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PackagePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPackage" ADD CONSTRAINT "ClientPackage_responsibleProfessionalId_fkey" FOREIGN KEY ("responsibleProfessionalId") REFERENCES "Professional"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormTemplate" ADD CONSTRAINT "FormTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormTemplateVersion" ADD CONSTRAINT "FormTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormTemplateService" ADD CONSTRAINT "FormTemplateService_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormTemplateService" ADD CONSTRAINT "FormTemplateService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormEntry" ADD CONSTRAINT "FormEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormEntry" ADD CONSTRAINT "FormEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormEntry" ADD CONSTRAINT "FormEntry_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormEntry" ADD CONSTRAINT "FormEntry_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "FormTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormEntry" ADD CONSTRAINT "FormEntry_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormEntry" ADD CONSTRAINT "FormEntry_clientPackageId_fkey" FOREIGN KEY ("clientPackageId") REFERENCES "ClientPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormEntry" ADD CONSTRAINT "FormEntry_sessionRecordId_fkey" FOREIGN KEY ("sessionRecordId") REFERENCES "SessionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormEntryRevision" ADD CONSTRAINT "FormEntryRevision_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "FormEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAccessToken" ADD CONSTRAINT "FormAccessToken_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "FormEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormPermission" ADD CONSTRAINT "FormPermission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageMovement" ADD CONSTRAINT "PackageMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageMovement" ADD CONSTRAINT "PackageMovement_clientPackageId_fkey" FOREIGN KEY ("clientPackageId") REFERENCES "ClientPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageMovement" ADD CONSTRAINT "PackageMovement_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRecord" ADD CONSTRAINT "SessionRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRecord" ADD CONSTRAINT "SessionRecord_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRecord" ADD CONSTRAINT "SessionRecord_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRecord" ADD CONSTRAINT "SessionRecord_clientPackageId_fkey" FOREIGN KEY ("clientPackageId") REFERENCES "ClientPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRecord" ADD CONSTRAINT "SessionRecord_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRecordVersion" ADD CONSTRAINT "SessionRecordVersion_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "SessionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSignature" ADD CONSTRAINT "SessionSignature_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "SessionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSignature" ADD CONSTRAINT "SessionSignature_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SessionRecordVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---- Dados existentes ---------------------------------------------------------------------------

-- Contratação dos pacotes já vendidos = data da venda.
UPDATE "ClientPackage" SET "contractedAt" = "createdAt" WHERE "contractedAt" IS NULL;

-- Liga a venda de cada pacote ao pacote (mesma empresa, cliente, descrição "Nome — Cliente",
-- registrada junto com a venda; mensalidades de assinatura depois da venda). Só quando há
-- exatamente uma correspondência: na dúvida, fica sem ligação em vez de chutar.
WITH m AS (
  SELECT t.id AS tid, (array_agg(cp.id))[1] AS pid, count(*) AS n
  FROM "Transaction" t
  JOIN "ClientPackage" cp ON cp."companyId" = t."companyId" AND cp."clientId" = t."clientId"
  JOIN "Client" c ON c.id = cp."clientId"
  WHERE t."clientPackageId" IS NULL
    AND t.type = 'INCOME'
    AND t.category IN ('Pacotes', 'Assinaturas')
    AND t.description = cp."nameSnapshot" || ' — ' || c.name
    AND (
      abs(extract(epoch FROM (t."createdAt" - cp."createdAt"))) < 120
      OR (cp.recurring AND t.category = 'Assinaturas' AND t."createdAt" >= cp."createdAt")
    )
  GROUP BY t.id
)
UPDATE "Transaction" t SET "clientPackageId" = m.pid FROM m WHERE m.tid = t.id AND m.n = 1;

-- Livro de movimentos: cada sessão já usada numa comanda vira um CONSUME numerado.
INSERT INTO "PackageMovement" ("id", "companyId", "clientPackageId", "kind", "quantity", "appointmentId", "sessionNumber", "reason", "createdByUserId", "createdAt")
SELECT 'mig_' || ac.id, cp."companyId", cp.id, 'CONSUME', 1, ac."appointmentId",
       row_number() OVER (PARTITION BY cp.id ORDER BY ac."createdAt"),
       'Sessão usada antes do livro de movimentos', 'migration', ac."createdAt"
FROM "AppointmentCredit" ac
JOIN "ClientPackage" cp ON cp.id = ac."clientPackageId"
WHERE ac.kind = 'PACKAGE' AND NOT cp.recurring;

-- Se o contador antigo diverge das comandas registradas, um ajuste identificado (sem inventar datas).
INSERT INTO "PackageMovement" ("id", "companyId", "clientPackageId", "kind", "quantity", "reason", "createdByUserId", "createdAt")
SELECT 'mig_adj_' || cp.id, cp."companyId", cp.id, 'ADJUST', cp."sessionsUsed" - coalesce(x.n, 0),
       'Ajuste da migração: contador anterior sem comanda correspondente', 'migration', now()
FROM "ClientPackage" cp
LEFT JOIN (
  SELECT "clientPackageId", count(*) AS n FROM "AppointmentCredit"
  WHERE kind = 'PACKAGE' AND "clientPackageId" IS NOT NULL GROUP BY 1
) x ON x."clientPackageId" = cp.id
WHERE NOT cp.recurring AND cp."sessionsUsed" <> coalesce(x.n, 0);
