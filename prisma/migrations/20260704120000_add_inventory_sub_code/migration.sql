-- Add sub-code (price tier within a family code)
ALTER TABLE "inventory_items" ADD COLUMN "subCode" DECIMAL(12,2);

UPDATE "inventory_items" SET "subCode" = COALESCE("costPrice", 0);

ALTER TABLE "inventory_items" ALTER COLUMN "subCode" SET NOT NULL;

DROP INDEX IF EXISTS "inventory_items_branchId_code_colorId_type_key";

CREATE UNIQUE INDEX "inventory_items_branchId_code_subCode_colorId_type_key"
  ON "inventory_items"("branchId", "code", "subCode", "colorId", "type");
