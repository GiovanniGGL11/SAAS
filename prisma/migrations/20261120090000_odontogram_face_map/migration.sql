-- Prontuário fase 5: odontograma e mapa facial
CREATE TABLE "ToothMark" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tooth" INTEGER NOT NULL,
    "faces" TEXT[],
    "condition" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "authorUserId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),
    "doneByName" TEXT,
    "removedAt" TIMESTAMP(3),
    "removedByName" TEXT,
    CONSTRAINT "ToothMark_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ToothMark_companyId_clientId_idx" ON "ToothMark"("companyId", "clientId");
ALTER TABLE "ToothMark" ADD CONSTRAINT "ToothMark_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ToothMark" ADD CONSTRAINT "ToothMark_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FaceMap" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "points" JSONB NOT NULL,
    "notes" TEXT,
    "professionalId" TEXT,
    "authorUserId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceledAt" TIMESTAMP(3),
    "canceledByName" TEXT,
    "cancelReason" TEXT,
    CONSTRAINT "FaceMap_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FaceMap_companyId_clientId_createdAt_idx" ON "FaceMap"("companyId", "clientId", "createdAt");
ALTER TABLE "FaceMap" ADD CONSTRAINT "FaceMap_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FaceMap" ADD CONSTRAINT "FaceMap_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
