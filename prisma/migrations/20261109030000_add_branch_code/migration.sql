ALTER TABLE "branches" ADD COLUMN "code" VARCHAR(8);

UPDATE "branches" SET "code" = 'S' WHERE "id" = 'B000' AND ("code" IS NULL OR "code" = '');
UPDATE "branches" SET "code" = 'A' WHERE "id" = 'B001' AND ("code" IS NULL OR "code" = '');
UPDATE "branches" SET "code" = 'B' WHERE "id" = 'B002' AND ("code" IS NULL OR "code" = '');
UPDATE "branches" SET "code" = 'C' WHERE "id" = 'B003' AND ("code" IS NULL OR "code" = '');
UPDATE "branches" SET "code" = 'E' WHERE "id" = 'B004' AND ("code" IS NULL OR "code" = '');
UPDATE "branches" SET "code" = 'F' WHERE "id" = 'B005' AND ("code" IS NULL OR "code" = '');
UPDATE "branches" SET "code" = "id" WHERE "code" IS NULL OR "code" = '';

ALTER TABLE "branches" ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");
