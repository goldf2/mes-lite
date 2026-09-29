ALTER TABLE "Stock" ADD COLUMN "valuationComplete" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "StockLog" ADD COLUMN "valuationComplete" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "InventoryLot" ADD COLUMN "valuationComplete" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "InventoryCostLayer" ADD COLUMN "valuationComplete" BOOLEAN NOT NULL DEFAULT true;

-- Snapshot completeness for all posting paths, including quality and shortage settlement.
CREATE TRIGGER "StockLog_snapshot_incomplete_valuation"
AFTER INSERT ON "StockLog"
WHEN (SELECT "valuationComplete" FROM "Stock" WHERE "id" = NEW."stockId") = 0
BEGIN
  UPDATE "StockLog" SET "valuationComplete" = 0 WHERE "id" = NEW."id";
END;

-- Restoring a movement with unknown auxiliary quantity cannot make stock complete.
CREATE TRIGGER "StockLog_restore_incomplete_valuation"
AFTER INSERT ON "StockLog"
WHEN NEW."valuationComplete" = 0
BEGIN
  UPDATE "Stock" SET "valuationComplete" = 0 WHERE "id" = NEW."stockId";
END;
