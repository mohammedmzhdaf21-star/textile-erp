ALTER TABLE "tailor_measurements" ADD COLUMN "givenOn" DATE;
ALTER TABLE "tailor_measurements" ADD COLUMN "returnOn" DATE;

UPDATE "tailor_measurements"
SET "givenOn" = ("createdAt" AT TIME ZONE 'UTC')::date
WHERE "givenOn" IS NULL;

UPDATE "tailor_measurements"
SET "returnOn" = "givenOn"
WHERE "returnOn" IS NULL;

ALTER TABLE "tailor_measurements" ALTER COLUMN "givenOn" SET NOT NULL;
ALTER TABLE "tailor_measurements" ALTER COLUMN "returnOn" SET NOT NULL;
