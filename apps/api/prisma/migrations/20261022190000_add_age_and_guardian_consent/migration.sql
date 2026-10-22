-- POPIA age gate: date of birth on the profile, and a guardian-consent record for
-- 16- and 17-year-olds. Both are additive and nullable/optional for existing rows.

ALTER TABLE "profile" ADD COLUMN "dateOfBirth" TIMESTAMP(3);

CREATE TABLE "guardianConsent" (
  "userId"          TEXT NOT NULL,
  "guardianName"    TEXT NOT NULL,
  "guardianContact" TEXT NOT NULL,
  "confirmedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "guardianConsent_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "guardianConsent"
  ADD CONSTRAINT "guardianConsent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
