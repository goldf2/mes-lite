-- Preserve the valuation quantity reserved at order creation time.

ALTER TABLE "PickItem" ADD COLUMN "reservedValuationQty" REAL NOT NULL DEFAULT 0;

UPDATE "PickItem"
SET "reservedValuationQty" = "requiredQty"
WHERE "reservedValuationQty" = 0;
