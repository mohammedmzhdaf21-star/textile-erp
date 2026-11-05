-- CreateTable
CREATE TABLE "tailor_measurements" (
    "id" TEXT NOT NULL,
    "code" SERIAL NOT NULL,
    "customerName" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "shoulderCm" DECIMAL(6, 1) NOT NULL,
    "armCm" DECIMAL(6, 1) NOT NULL,
    "waistCm" DECIMAL(6, 1) NOT NULL,
    "chestCm" DECIMAL(6, 1) NOT NULL,
    "heightCm" DECIMAL(6, 1) NOT NULL,
    "buttCm" DECIMAL(6, 1) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tailor_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tailor_measurements_code_key" ON "tailor_measurements"("code");

-- CreateIndex
CREATE INDEX "tailor_measurements_phone_idx" ON "tailor_measurements"("phone");

-- CreateIndex
CREATE INDEX "tailor_measurements_customerName_idx" ON "tailor_measurements"("customerName");

-- AddForeignKey
ALTER TABLE "tailor_measurements" ADD CONSTRAINT "tailor_measurements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
