-- Company accounts need an explicit moderator approval before they can search for learners.
-- A separate table keeps the better-auth `user` table generated and means a role change
-- alone never opens candidate search.

CREATE TABLE "companyProfile" (
  "userId"           TEXT NOT NULL,
  "organisationName" TEXT,
  "approved"         BOOLEAN NOT NULL DEFAULT false,
  "approvedAt"       TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "companyProfile_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "companyProfile"
  ADD CONSTRAINT "companyProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
