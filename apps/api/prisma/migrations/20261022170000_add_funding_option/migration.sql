-- Funding options were in schema.prisma but had no migration, so a database created only
-- from the committed migrations (including iskole_test) had no fundingOption table.
-- IF NOT EXISTS makes this a no-op on databases that already have it from an earlier push.

CREATE TABLE IF NOT EXISTS "fundingOption" (
  "id"                  TEXT NOT NULL,
  "name"                TEXT NOT NULL,
  "provider"            TEXT NOT NULL,
  "type"                TEXT NOT NULL,
  "description"         TEXT,
  "eligibility"         TEXT,
  "benefits"            TEXT,
  "coversTuition"       BOOLEAN NOT NULL DEFAULT false,
  "coversAccommodation" BOOLEAN NOT NULL DEFAULT false,
  "coversBooks"         BOOLEAN NOT NULL DEFAULT false,
  "coversAllowance"     BOOLEAN NOT NULL DEFAULT false,
  "amountMin"           INTEGER,
  "amountMax"           INTEGER,
  "deadline"            TIMESTAMP(3),
  "website"             TEXT,
  "isActive"            BOOLEAN NOT NULL DEFAULT true,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fundingOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "fundingOption_name_key" ON "fundingOption"("name");
