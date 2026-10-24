-- AlterTable
ALTER TABLE "idempotencyKey" ALTER COLUMN "userId" DROP NOT NULL,
ALTER COLUMN "responseBody" DROP NOT NULL;
