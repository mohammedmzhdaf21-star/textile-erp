UPDATE "inventory_items" SET "pieceLength" = 0 WHERE "pieceLength" IS NULL;

ALTER TABLE "inventory_items" ALTER COLUMN "pieceLength" SET DEFAULT 0;
ALTER TABLE "inventory_items" ALTER COLUMN "pieceLength" SET NOT NULL;

DROP INDEX IF EXISTS "inventory_items_branchId_code_subCode_colorId_type_key";

CREATE UNIQUE INDEX "inventory_items_branchId_code_subCode_colorId_type_pieceLength_key"
  ON "inventory_items"("branchId", "code", "subCode", "colorId", "type", "pieceLength");
