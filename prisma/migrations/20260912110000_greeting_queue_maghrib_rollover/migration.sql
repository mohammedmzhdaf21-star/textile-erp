-- AlterTable
ALTER TABLE "branch_greeting_queues" ADD COLUMN "maghribSnapshotIndex" INTEGER,
ADD COLUMN "maghribSnapshotEmployeeId" TEXT,
ADD COLUMN "maghribSnapshotDay" VARCHAR(10),
ADD COLUMN "queueDayAppliedKey" VARCHAR(10);
