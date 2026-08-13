-- CreateEnum
CREATE TYPE "DeviceSignInStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DEVICE_SIGN_IN';

-- CreateTable
CREATE TABLE "device_sign_in_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "deviceKey" VARCHAR(64) NOT NULL,
    "deviceLabel" VARCHAR(200),
    "userAgent" VARCHAR(500),
    "ipAddress" VARCHAR(45),
    "status" "DeviceSignInStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_sign_in_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "device_sign_in_requests_status_idx" ON "device_sign_in_requests"("status");

-- CreateIndex
CREATE INDEX "device_sign_in_requests_employeeId_idx" ON "device_sign_in_requests"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "device_sign_in_requests_employeeId_deviceKey_key" ON "device_sign_in_requests"("employeeId", "deviceKey");

-- AddForeignKey
ALTER TABLE "device_sign_in_requests" ADD CONSTRAINT "device_sign_in_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sign_in_requests" ADD CONSTRAINT "device_sign_in_requests_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
