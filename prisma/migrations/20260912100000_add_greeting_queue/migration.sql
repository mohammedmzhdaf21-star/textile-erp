-- CreateTable
CREATE TABLE "branch_greeting_queues" (
    "branchId" VARCHAR(5) NOT NULL,
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_greeting_queues_pkey" PRIMARY KEY ("branchId")
);

-- CreateTable
CREATE TABLE "greeting_queue_events" (
    "id" TEXT NOT NULL,
    "branchId" VARCHAR(5) NOT NULL,
    "employeeId" TEXT NOT NULL,
    "greetedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "greeting_queue_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "greeting_queue_events_branchId_greetedAt_idx" ON "greeting_queue_events"("branchId", "greetedAt");

-- CreateIndex
CREATE INDEX "greeting_queue_events_employeeId_greetedAt_idx" ON "greeting_queue_events"("employeeId", "greetedAt");

-- AddForeignKey
ALTER TABLE "branch_greeting_queues" ADD CONSTRAINT "branch_greeting_queues_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "greeting_queue_events" ADD CONSTRAINT "greeting_queue_events_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "greeting_queue_events" ADD CONSTRAINT "greeting_queue_events_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
