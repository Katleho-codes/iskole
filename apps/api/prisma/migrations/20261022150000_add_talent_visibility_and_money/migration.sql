-- POPIA opt-in for company discovery, plus the expense and budget tables.
-- Guarded with IF NOT EXISTS so it can be applied to a database that was repaired by hand
-- during development without failing.

ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "talentVisible" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "expense" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "category"    TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "description" TEXT,
  "spentAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "expense_userId_spentAt_idx" ON "expense"("userId", "spentAt");

ALTER TABLE "expense" DROP CONSTRAINT IF EXISTS "expense_userId_fkey";
ALTER TABLE "expense" ADD CONSTRAINT "expense_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "budget" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "category"    TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "period"      TEXT NOT NULL DEFAULT 'MONTHLY',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "budget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "budget_userId_category_period_key"
  ON "budget"("userId", "category", "period");

CREATE INDEX IF NOT EXISTS "budget_userId_idx" ON "budget"("userId");

ALTER TABLE "budget" DROP CONSTRAINT IF EXISTS "budget_userId_fkey";
ALTER TABLE "budget" ADD CONSTRAINT "budget_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
