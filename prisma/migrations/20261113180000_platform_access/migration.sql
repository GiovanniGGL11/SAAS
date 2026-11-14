-- CreateTable
CREATE TABLE "PlatformAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformAccess_createdAt_idx" ON "PlatformAccess"("createdAt");

-- CreateIndex
CREATE INDEX "PlatformAccess_userId_createdAt_idx" ON "PlatformAccess"("userId", "createdAt");
