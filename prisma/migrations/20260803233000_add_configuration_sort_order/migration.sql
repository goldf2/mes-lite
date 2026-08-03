ALTER TABLE "InventoryLocation" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WorkCenter" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Employee" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProcessRoute" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProcessTemplate" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Supplier" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

WITH "ordered" AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "isDefault" DESC, "code" ASC, "id" ASC) - 1 AS "position"
  FROM "InventoryLocation"
)
UPDATE "InventoryLocation" SET "sortOrder" = (SELECT "position" FROM "ordered" WHERE "ordered"."id" = "InventoryLocation"."id");

WITH "ordered" AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "isActive" DESC, "code" ASC, "id" ASC) - 1 AS "position"
  FROM "WorkCenter"
)
UPDATE "WorkCenter" SET "sortOrder" = (SELECT "position" FROM "ordered" WHERE "ordered"."id" = "WorkCenter"."id");

WITH "ordered" AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "isActive" DESC, "code" ASC, "id" ASC) - 1 AS "position"
  FROM "Employee"
)
UPDATE "Employee" SET "sortOrder" = (SELECT "position" FROM "ordered" WHERE "ordered"."id" = "Employee"."id");

WITH "ordered" AS (
  SELECT "ProcessRoute"."id", ROW_NUMBER() OVER (ORDER BY "Product"."sku" ASC, "ProcessRoute"."id" ASC) - 1 AS "position"
  FROM "ProcessRoute"
  INNER JOIN "Product" ON "Product"."id" = "ProcessRoute"."productId"
)
UPDATE "ProcessRoute" SET "sortOrder" = (SELECT "position" FROM "ordered" WHERE "ordered"."id" = "ProcessRoute"."id");

WITH "ordered" AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "isPreset" DESC, "category" ASC, "code" ASC, "id" ASC) - 1 AS "position"
  FROM "ProcessTemplate"
)
UPDATE "ProcessTemplate" SET "sortOrder" = (SELECT "position" FROM "ordered" WHERE "ordered"."id" = "ProcessTemplate"."id");

WITH "ordered" AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" DESC, "id" ASC) - 1 AS "position"
  FROM "Customer"
)
UPDATE "Customer" SET "sortOrder" = (SELECT "position" FROM "ordered" WHERE "ordered"."id" = "Customer"."id");

WITH "ordered" AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" DESC, "id" ASC) - 1 AS "position"
  FROM "Supplier"
)
UPDATE "Supplier" SET "sortOrder" = (SELECT "position" FROM "ordered" WHERE "ordered"."id" = "Supplier"."id");

CREATE INDEX "InventoryLocation_sortOrder_idx" ON "InventoryLocation"("sortOrder");
CREATE INDEX "WorkCenter_sortOrder_idx" ON "WorkCenter"("sortOrder");
CREATE INDEX "Employee_sortOrder_idx" ON "Employee"("sortOrder");
CREATE INDEX "ProcessRoute_sortOrder_idx" ON "ProcessRoute"("sortOrder");
CREATE INDEX "ProcessTemplate_sortOrder_idx" ON "ProcessTemplate"("sortOrder");
CREATE INDEX "Customer_sortOrder_idx" ON "Customer"("sortOrder");
CREATE INDEX "Supplier_sortOrder_idx" ON "Supplier"("sortOrder");
