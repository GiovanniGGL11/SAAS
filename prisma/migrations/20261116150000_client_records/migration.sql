-- CreateTable
CREATE TABLE "ClientRecordBlock" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientRecordBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientRecordEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "internalNotes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientRecordEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientRecordPhoto" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "caption" TEXT,
    "staffOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientRecordPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientRecordBlock_companyId_clientId_idx" ON "ClientRecordBlock"("companyId", "clientId");

-- CreateIndex
CREATE INDEX "ClientRecordEntry_blockId_date_idx" ON "ClientRecordEntry"("blockId", "date");

-- CreateIndex
CREATE INDEX "ClientRecordPhoto_entryId_idx" ON "ClientRecordPhoto"("entryId");

-- AddForeignKey
ALTER TABLE "ClientRecordBlock" ADD CONSTRAINT "ClientRecordBlock_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRecordBlock" ADD CONSTRAINT "ClientRecordBlock_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRecordEntry" ADD CONSTRAINT "ClientRecordEntry_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ClientRecordBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRecordPhoto" ADD CONSTRAINT "ClientRecordPhoto_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ClientRecordEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
