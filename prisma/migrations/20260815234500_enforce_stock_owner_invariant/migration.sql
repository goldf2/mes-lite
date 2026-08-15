-- A Stock row must belong to exactly one inventory owner. Product-only rows
-- remain valid until the Product -> Material migration is approved and run.

CREATE TABLE "__StockOwnerMigrationGuard" (
  "invalidCount" INTEGER NOT NULL CHECK ("invalidCount" = 0)
);

INSERT INTO "__StockOwnerMigrationGuard" ("invalidCount")
SELECT COUNT(*)
FROM "Stock"
WHERE ("materialId" IS NULL AND "productId" IS NULL)
   OR ("materialId" IS NOT NULL AND "productId" IS NOT NULL);

DROP TABLE "__StockOwnerMigrationGuard";

CREATE TRIGGER "Stock_owner_insert_guard"
BEFORE INSERT ON "Stock"
WHEN (NEW."materialId" IS NULL AND NEW."productId" IS NULL)
  OR (NEW."materialId" IS NOT NULL AND NEW."productId" IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, '库存记录必须且只能关联一个库存对象');
END;

CREATE TRIGGER "Stock_owner_update_guard"
BEFORE UPDATE OF "materialId", "productId" ON "Stock"
WHEN (NEW."materialId" IS NULL AND NEW."productId" IS NULL)
  OR (NEW."materialId" IS NOT NULL AND NEW."productId" IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, '库存记录必须且只能关联一个库存对象');
END;
