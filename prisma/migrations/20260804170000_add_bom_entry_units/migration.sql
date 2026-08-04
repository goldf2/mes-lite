ALTER TABLE "BOMItem" ADD COLUMN "entryUnit" TEXT;
ALTER TABLE "BOMOutput" ADD COLUMN "entryUnit" TEXT;

UPDATE "BOMItem" SET "entryUnit" = "unit" WHERE "entryUnit" IS NULL;
UPDATE "BOMOutput" SET "entryUnit" = "unit" WHERE "entryUnit" IS NULL;
