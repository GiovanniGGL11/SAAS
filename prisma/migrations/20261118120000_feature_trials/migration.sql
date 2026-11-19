-- Teste de 3 dias de recursos fora do plano (uma vez por recurso) e demonstração curta da IA
ALTER TABLE "Company" ADD COLUMN "featureTrials" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Company" ADD COLUMN "aiDemoUsed" INTEGER NOT NULL DEFAULT 0;
