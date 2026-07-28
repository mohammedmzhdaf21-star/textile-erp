ALTER TABLE "inventory_items" ADD COLUMN "isPiecePackage" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "inventory_items" ADD COLUMN "packageKey" VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE "inventory_items" ADD COLUMN "packageComponents" JSONB;

DROP INDEX IF EXISTS "inventory_items_branchId_code_subCode_colorId_type_pieceLength_key";

CREATE UNIQUE INDEX "inventory_items_branchId_code_subCode_colorId_type_pieceLength_packageKey_key"
  ON "inventory_items"("branchId", "code", "subCode", "colorId", "type", "pieceLength", "packageKey");
