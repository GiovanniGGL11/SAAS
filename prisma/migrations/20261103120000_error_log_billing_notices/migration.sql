-- CreateTable
CREATE TABLE "ServerErrorLog" (
    "id" TEXT NOT NULL,
    "digest" TEXT,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "routePath" TEXT,
    "routeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingNotice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServerErrorLog_createdAt_idx" ON "ServerErrorLog"("createdAt");

-- CreateIndex
CREATE INDEX "ServerErrorLog_digest_idx" ON "ServerErrorLog"("digest");

-- CreateIndex
CREATE UNIQUE INDEX "BillingNotice_key_key" ON "BillingNotice"("key");

-- CreateIndex
CREATE INDEX "BillingNotice_companyId_idx" ON "BillingNotice"("companyId");

