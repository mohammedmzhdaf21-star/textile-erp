ALTER TABLE "tailor_measurements" ADD COLUMN "sellerEmployeeId" TEXT;
ALTER TABLE "tailor_measurements" ADD COLUMN "commissionIqd" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "tailor_measurements" ADD COLUMN "commissionStatus" "CommissionEntryStatus" NOT NULL DEFAULT 'PENDING';

ALTER TABLE "tailor_measurements"
  ADD CONSTRAINT "tailor_measurements_sellerEmployeeId_fkey"
  FOREIGN KEY ("sellerEmployeeId") REFERENCES "employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "tailor_measurements_sellerEmployeeId_commissionStatus_idx"
  ON "tailor_measurements"("sellerEmployeeId", "commissionStatus");
