-- Exact reversals use a locked two-way link:
-- original.reversalMovementId -> reversal.id and reversal.sourceMovementId -> original.id.
-- sourceMovementId remains non-unique because it also represents partial business lineage.

CREATE TABLE "__StockLogReversalMigrationGuard" (
  "invalidCount" INTEGER NOT NULL CHECK ("invalidCount" = 0)
);

INSERT INTO "__StockLogReversalMigrationGuard" ("invalidCount")
SELECT COUNT(*)
FROM "StockLog" AS original
LEFT JOIN "StockLog" AS reversal ON reversal."id" = original."reversalMovementId"
WHERE original."reversalMovementId" IS NOT NULL
  AND (
    reversal."id" IS NULL
    OR reversal."sourceMovementId" IS NOT original."id"
    OR reversal."stockId" IS NOT original."stockId"
    OR ABS(COALESCE(original."qty", 0) + COALESCE(reversal."qty", 0)) > 0.000001
    OR ABS(COALESCE(original."valuationQty", 0) + COALESCE(reversal."valuationQty", 0)) > 0.000001
    OR ABS(COALESCE(original."costAmount", 0) + COALESCE(reversal."costAmount", 0)) > 0.000001
  );

DROP TABLE "__StockLogReversalMigrationGuard";

CREATE UNIQUE INDEX "StockLog_reversalMovementId_key" ON "StockLog"("reversalMovementId");
CREATE INDEX "StockLog_sourceMovementId_idx" ON "StockLog"("sourceMovementId");

CREATE TRIGGER "StockLog_validate_reversal_link"
BEFORE UPDATE OF "reversalMovementId" ON "StockLog"
WHEN NEW."reversalMovementId" IS NOT NULL AND OLD."reversalMovementId" IS NULL
BEGIN
  SELECT CASE WHEN NEW."reversalMovementId" = NEW."id"
    THEN RAISE(ABORT, '库存流水不能冲销自身') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM "StockLog" AS reversal
    WHERE reversal."id" = NEW."reversalMovementId"
      AND reversal."sourceMovementId" = NEW."id"
      AND reversal."stockId" = NEW."stockId"
      AND ABS(COALESCE(NEW."qty", 0) + COALESCE(reversal."qty", 0)) <= 0.000001
      AND ABS(COALESCE(NEW."valuationQty", 0) + COALESCE(reversal."valuationQty", 0)) <= 0.000001
      AND ABS(COALESCE(NEW."costAmount", 0) + COALESCE(reversal."costAmount", 0)) <= 0.000001
  ) THEN RAISE(ABORT, '库存冲销关系不完整或数量金额不守恒') END;
END;

CREATE TRIGGER "StockLog_lock_reversed_source"
BEFORE UPDATE ON "StockLog"
WHEN OLD."reversalMovementId" IS NOT NULL AND (
  NEW."reversalMovementId" IS NOT OLD."reversalMovementId"
  OR NEW."stockId" IS NOT OLD."stockId"
  OR NEW."qty" IS NOT OLD."qty"
  OR NEW."valuationQty" IS NOT OLD."valuationQty"
  OR NEW."costAmount" IS NOT OLD."costAmount"
)
BEGIN
  SELECT RAISE(ABORT, '库存冲销关系已经锁定');
END;

CREATE TRIGGER "StockLog_lock_reversal_movement"
BEFORE UPDATE ON "StockLog"
WHEN EXISTS (SELECT 1 FROM "StockLog" AS original WHERE original."reversalMovementId" = OLD."id")
  AND (
    NEW."sourceMovementId" IS NOT OLD."sourceMovementId"
    OR NEW."stockId" IS NOT OLD."stockId"
    OR NEW."qty" IS NOT OLD."qty"
    OR NEW."valuationQty" IS NOT OLD."valuationQty"
    OR NEW."costAmount" IS NOT OLD."costAmount"
  )
BEGIN
  SELECT RAISE(ABORT, '库存冲销关系已经锁定');
END;

CREATE TRIGGER "StockLog_prevent_linked_reversal_delete"
BEFORE DELETE ON "StockLog"
WHEN OLD."reversalMovementId" IS NOT NULL
  OR EXISTS (SELECT 1 FROM "StockLog" AS original WHERE original."reversalMovementId" = OLD."id")
BEGIN
  SELECT RAISE(ABORT, '库存冲销关系已经锁定');
END;
