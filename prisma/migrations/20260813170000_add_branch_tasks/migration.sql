-- CreateTable
CREATE TABLE "branch_task_entries" (
    "id" TEXT NOT NULL,
    "branchId" VARCHAR(5) NOT NULL,
    "templateKey" VARCHAR(50) NOT NULL,
    "title" TEXT NOT NULL,
    "assignedToEmail" VARCHAR(255) NOT NULL,
    "assignedToId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "schedule" VARCHAR(20) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'TODO',
    "checkedBy" VARCHAR(255),
    "checkedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "sourceSaleId" VARCHAR(100),
    "sourceItemId" VARCHAR(100),
    "code" INTEGER,
    "colorName" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_task_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_task_assignments" (
    "id" TEXT NOT NULL,
    "branchId" VARCHAR(5) NOT NULL,
    "templateKey" VARCHAR(50) NOT NULL,
    "title" TEXT NOT NULL,
    "assignedToEmail" VARCHAR(255) NOT NULL,
    "assignedToId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "schedule" VARCHAR(20) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_task_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branch_task_entries_branchId_status_idx" ON "branch_task_entries"("branchId", "status");

-- CreateIndex
CREATE INDEX "branch_task_entries_assignedToId_status_idx" ON "branch_task_entries"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "branch_task_entries_assignedToEmail_idx" ON "branch_task_entries"("assignedToEmail");

-- CreateIndex
CREATE INDEX "branch_task_entries_templateKey_idx" ON "branch_task_entries"("templateKey");

-- CreateIndex
CREATE UNIQUE INDEX "branch_task_assignments_branchId_templateKey_key" ON "branch_task_assignments"("branchId", "templateKey");

-- AddForeignKey
ALTER TABLE "branch_task_entries" ADD CONSTRAINT "branch_task_entries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_task_entries" ADD CONSTRAINT "branch_task_entries_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_task_assignments" ADD CONSTRAINT "branch_task_assignments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_task_assignments" ADD CONSTRAINT "branch_task_assignments_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
