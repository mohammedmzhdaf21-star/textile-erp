-- Persist item conversion lineage (roll-to-piece, branch transfer, etc.)
ALTER TABLE "inventory_items"
ADD COLUMN IF NOT EXISTS "sourceItemId" VARCHAR(100),
ADD COLUMN IF NOT EXISTS "conversionType" VARCHAR(50);

CREATE INDEX IF NOT EXISTS "inventory_items_sourceItemId_idx"
ON "inventory_items"("sourceItemId");
