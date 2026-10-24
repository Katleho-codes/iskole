-- M5: a learner can flag an expense for the payday reminder, and clinic bookings
-- carry a fixed-list reason rather than free-text health detail.
ALTER TABLE "expense" ADD COLUMN     "remindMe" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "booking" ADD COLUMN     "reason" TEXT;
