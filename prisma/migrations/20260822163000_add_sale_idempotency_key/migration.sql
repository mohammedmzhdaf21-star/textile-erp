-- AlterTable
ALTER TABLE "sales" ADD COLUMN "idempotencyKey" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "sales_idempotencyKey_key" ON "sales"("idempotencyKey");
