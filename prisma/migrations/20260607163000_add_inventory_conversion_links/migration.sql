DROP INDEX IF EXISTS "inventory_items_branchId_code_colorId_type_key";

ALTER TABLE "inventory_items"
ADD COLUMN "sourceItemId" VARCHAR(100),
ADD COLUMN "conversionType" VARCHAR(50);

CREATE INDEX "inventory_items_branchId_code_colorId_idx"
ON "inventory_items"("branchId", "code", "colorId");

CREATE INDEX "inventory_items_sourceItemId_idx"
ON "inventory_items"("sourceItemId");
