-- Study plans, clinic slots and bookings, and community/messages/reports.
-- IF NOT EXISTS keeps this safe on a development database that already has some tables
-- from a manual repair, while a fresh database gets everything from this migration.

CREATE TABLE IF NOT EXISTS "studyPlan" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "approved"  BOOLEAN NOT NULL DEFAULT false,
  "blocks"    JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "studyPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "studyPlan_userId_createdAt_idx" ON "studyPlan"("userId", "createdAt");
ALTER TABLE "studyPlan" DROP CONSTRAINT IF EXISTS "studyPlan_userId_fkey";
ALTER TABLE "studyPlan" ADD CONSTRAINT "studyPlan_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "clinicSlot" (
  "id"        TEXT NOT NULL,
  "startsAt"  TIMESTAMP(3) NOT NULL,
  "endsAt"    TIMESTAMP(3) NOT NULL,
  "topic"     TEXT NOT NULL,
  "capacity"  INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinicSlot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "clinicSlot_startsAt_topic_key" ON "clinicSlot"("startsAt", "topic");
CREATE INDEX IF NOT EXISTS "clinicSlot_startsAt_idx" ON "clinicSlot"("startsAt");

CREATE TABLE IF NOT EXISTS "booking" (
  "id"        TEXT NOT NULL,
  "slotId"    TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "status"    TEXT NOT NULL DEFAULT 'CONFIRMED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "booking_slotId_userId_key" ON "booking"("slotId", "userId");
CREATE INDEX IF NOT EXISTS "booking_userId_idx" ON "booking"("userId");
ALTER TABLE "booking" DROP CONSTRAINT IF EXISTS "booking_slotId_fkey";
ALTER TABLE "booking" ADD CONSTRAINT "booking_slotId_fkey"
  FOREIGN KEY ("slotId") REFERENCES "clinicSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking" DROP CONSTRAINT IF EXISTS "booking_userId_fkey";
ALTER TABLE "booking" ADD CONSTRAINT "booking_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "community" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "field"       TEXT,
  "description" TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "community_name_key" ON "community"("name");

CREATE TABLE IF NOT EXISTS "message" (
  "id"          TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "message_communityId_createdAt_idx" ON "message"("communityId", "createdAt");
CREATE INDEX IF NOT EXISTS "message_userId_idx" ON "message"("userId");
ALTER TABLE "message" DROP CONSTRAINT IF EXISTS "message_communityId_fkey";
ALTER TABLE "message" ADD CONSTRAINT "message_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message" DROP CONSTRAINT IF EXISTS "message_userId_fkey";
ALTER TABLE "message" ADD CONSTRAINT "message_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "report" (
  "id"         TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId"   TEXT NOT NULL,
  "reason"     TEXT NOT NULL,
  "status"     TEXT NOT NULL DEFAULT 'SUBMITTED',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "report_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "report_status_createdAt_idx" ON "report"("status", "createdAt");
ALTER TABLE "report" DROP CONSTRAINT IF EXISTS "report_reporterId_fkey";
ALTER TABLE "report" ADD CONSTRAINT "report_reporterId_fkey"
  FOREIGN KEY ("reporterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
