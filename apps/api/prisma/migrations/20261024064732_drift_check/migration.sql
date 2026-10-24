/*
  Warnings:

  - You are about to drop the column `reason` on the `booking` table. All the data in the column will be lost.
  - You are about to drop the column `remindMe` on the `expense` table. All the data in the column will be lost.
  - You are about to drop the `consent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `moneyPlan` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `notification` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `savedFunding` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "consent" DROP CONSTRAINT "consent_userId_fkey";

-- DropForeignKey
ALTER TABLE "moneyPlan" DROP CONSTRAINT "moneyPlan_userId_fkey";

-- DropForeignKey
ALTER TABLE "notification" DROP CONSTRAINT "notification_userId_fkey";

-- DropForeignKey
ALTER TABLE "savedFunding" DROP CONSTRAINT "savedFunding_fundingOptionId_fkey";

-- DropForeignKey
ALTER TABLE "savedFunding" DROP CONSTRAINT "savedFunding_userId_fkey";

-- AlterTable
ALTER TABLE "booking" DROP COLUMN "reason";

-- AlterTable
ALTER TABLE "expense" DROP COLUMN "remindMe";

-- DropTable
DROP TABLE "consent";

-- DropTable
DROP TABLE "moneyPlan";

-- DropTable
DROP TABLE "notification";

-- DropTable
DROP TABLE "savedFunding";
