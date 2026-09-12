-- CreateTable
CREATE TABLE "branch_daily_attendance_qrs" (
    "id" TEXT NOT NULL,
    "branchId" VARCHAR(5) NOT NULL,
    "attendanceDay" VARCHAR(10) NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "qrCodeValue" VARCHAR(200) NOT NULL,
    "qrCodeDataUrl" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_daily_attendance_qrs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "branchId" VARCHAR(5) NOT NULL,
    "attendanceDay" VARCHAR(10) NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branch_daily_attendance_qrs_token_key" ON "branch_daily_attendance_qrs"("token");

-- CreateIndex
CREATE UNIQUE INDEX "branch_daily_attendance_qrs_branchId_attendanceDay_key" ON "branch_daily_attendance_qrs"("branchId", "attendanceDay");

-- CreateIndex
CREATE INDEX "branch_daily_attendance_qrs_branchId_validUntil_idx" ON "branch_daily_attendance_qrs"("branchId", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_employeeId_branchId_attendanceDay_key" ON "attendance_records"("employeeId", "branchId", "attendanceDay");

-- CreateIndex
CREATE INDEX "attendance_records_branchId_attendanceDay_idx" ON "attendance_records"("branchId", "attendanceDay");

-- CreateIndex
CREATE INDEX "attendance_records_employeeId_checkedInAt_idx" ON "attendance_records"("employeeId", "checkedInAt");

-- AddForeignKey
ALTER TABLE "branch_daily_attendance_qrs" ADD CONSTRAINT "branch_daily_attendance_qrs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
