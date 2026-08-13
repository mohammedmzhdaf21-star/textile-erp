-- CreateEnum
CREATE TYPE "EmployeeApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'EMPLOYEE_REGISTRATION';

-- AlterTable
ALTER TABLE "employees" ADD COLUMN "approvalStatus" "EmployeeApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "registrationNote" TEXT;

-- CreateIndex
CREATE INDEX "employees_approvalStatus_idx" ON "employees"("approvalStatus");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
