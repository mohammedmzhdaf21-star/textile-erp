-- CreateEnum
CREATE TYPE "CommissionEntryStatus" AS ENUM ('PENDING', 'PAID');

-- CreateTable
CREATE TABLE "employee_commission_entries" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "soldPrice" DECIMAL(12,2) NOT NULL,
    "minimumPrice" DECIMAL(12,2) NOT NULL,
    "quantitySold" DECIMAL(10,2) NOT NULL,
    "ratePercent" DECIMAL(5,2) NOT NULL,
    "commissionAmount" DECIMAL(12,2) NOT NULL,
    "status" "CommissionEntryStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_commission_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_commission_entries_saleItemId_key" ON "employee_commission_entries"("saleItemId");

-- CreateIndex
CREATE INDEX "employee_commission_entries_employeeId_status_idx" ON "employee_commission_entries"("employeeId", "status");

-- CreateIndex
CREATE INDEX "employee_commission_entries_saleId_idx" ON "employee_commission_entries"("saleId");

-- CreateIndex
CREATE INDEX "employee_commission_entries_status_idx" ON "employee_commission_entries"("status");

-- AddForeignKey
ALTER TABLE "employee_commission_entries" ADD CONSTRAINT "employee_commission_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_commission_entries" ADD CONSTRAINT "employee_commission_entries_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_commission_entries" ADD CONSTRAINT "employee_commission_entries_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_commission_entries" ADD CONSTRAINT "employee_commission_entries_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
