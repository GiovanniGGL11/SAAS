-- Plano de tratamento: sessões feitas dos procedimentos de orçamentos aprovados
CREATE TABLE "TreatmentProcedure" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "itemIndex" INTEGER NOT NULL,
    "appointmentId" TEXT,
    "clinicalNoteId" TEXT,
    "note" TEXT,
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneByUserId" TEXT NOT NULL,
    "doneByName" TEXT NOT NULL,
    CONSTRAINT "TreatmentProcedure_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TreatmentProcedure_companyId_clientId_idx" ON "TreatmentProcedure"("companyId", "clientId");
CREATE INDEX "TreatmentProcedure_quoteId_itemIndex_idx" ON "TreatmentProcedure"("quoteId", "itemIndex");
ALTER TABLE "TreatmentProcedure" ADD CONSTRAINT "TreatmentProcedure_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TreatmentProcedure" ADD CONSTRAINT "TreatmentProcedure_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
