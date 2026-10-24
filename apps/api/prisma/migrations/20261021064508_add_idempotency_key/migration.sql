-- CreateTable
CREATE TABLE "idempotencyKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idempotencyKey_expiresAt_idx" ON "idempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotencyKey_userId_key_key" ON "idempotencyKey"("userId", "key");

-- AddForeignKey
ALTER TABLE "idempotencyKey" ADD CONSTRAINT "idempotencyKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
