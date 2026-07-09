ALTER TABLE "inventory_items" ADD COLUMN "packageComponentStock" JSONB;

ALTER TABLE "sale_items" ADD COLUMN "isPiecePackage" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sale_items" ADD COLUMN "packageSaleMode" VARCHAR(20);
ALTER TABLE "sale_items" ADD COLUMN "packagesSold" INTEGER;
ALTER TABLE "sale_items" ADD COLUMN "packageComponentsSold" JSONB;
