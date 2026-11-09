ALTER TABLE "inventory_items" ADD COLUMN "designCode" VARCHAR(8) NOT NULL DEFAULT '';

DROP INDEX IF EXISTS "inventory_items_branchId_code_subCode_colorId_type_pieceLength_packageKey_key";

CREATE UNIQUE INDEX "inventory_items_branchId_code_designCode_subCode_colorId_type_pieceLength_packageKey_key"
  ON "inventory_items"("branchId", "code", "designCode", "subCode", "colorId", "type", "pieceLength", "packageKey");
