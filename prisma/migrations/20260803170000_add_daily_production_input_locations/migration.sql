-- All reports before this migration are pre-production test data. Revert the net
-- inventory effect of reports that are still confirmed, restore their consumed
-- input cost layers, and then remove the old reports and movements.
CREATE TEMP TABLE "_DailyProductionStockNet" AS
SELECT
  "StockLog"."stockId" AS "stockId",
  SUM("StockLog"."qty") AS "qty",
  SUM(COALESCE("StockLog"."valuationQty", 0)) AS "valuationQty",
  SUM(COALESCE("StockLog"."costAmount", 0)) AS "costAmount"
FROM "StockLog"
JOIN "DailyProductionReport"
  ON "StockLog"."refType" = 'DAILY_PRODUCTION_REPORT'
 AND "StockLog"."refId" = "DailyProductionReport"."id"
WHERE "DailyProductionReport"."status" = 'CONFIRMED'
GROUP BY "StockLog"."stockId";

CREATE TEMP TABLE "_DailyProductionLocationNet" AS
SELECT
  "StockLog"."stockId" AS "stockId",
  "StockLog"."locationId" AS "locationId",
  SUM("StockLog"."qty") AS "qty"
FROM "StockLog"
JOIN "DailyProductionReport"
  ON "StockLog"."refType" = 'DAILY_PRODUCTION_REPORT'
 AND "StockLog"."refId" = "DailyProductionReport"."id"
WHERE "DailyProductionReport"."status" = 'CONFIRMED'
  AND "StockLog"."locationId" IS NOT NULL
GROUP BY "StockLog"."stockId", "StockLog"."locationId";

CREATE TEMP TABLE "_DailyProductionLayerRestore" AS
SELECT
  json_extract("layer"."value", '$.costLayerId') AS "costLayerId",
  SUM(CAST(json_extract("layer"."value", '$.stockQty') AS REAL)) AS "stockQty",
  SUM(CAST(json_extract("layer"."value", '$.valuationQty') AS REAL)) AS "valuationQty",
  SUM(CAST(json_extract("layer"."value", '$.costAmount') AS REAL)) AS "costAmount"
FROM "DailyProductionConsumption"
JOIN "DailyProductionReport"
  ON "DailyProductionConsumption"."reportId" = "DailyProductionReport"."id",
json_each(
  CASE
    WHEN json_valid("DailyProductionConsumption"."costLayerSnapshot")
      THEN "DailyProductionConsumption"."costLayerSnapshot"
    ELSE '[]'
  END
) AS "layer"
WHERE "DailyProductionReport"."status" = 'CONFIRMED'
GROUP BY json_extract("layer"."value", '$.costLayerId');

UPDATE "InventoryCostLayer"
SET
  "remainingStockQty" = "remainingStockQty" + COALESCE((
    SELECT "stockQty" FROM "_DailyProductionLayerRestore"
    WHERE "costLayerId" = "InventoryCostLayer"."id"
  ), 0),
  "remainingValuationQty" = "remainingValuationQty" + COALESCE((
    SELECT "valuationQty" FROM "_DailyProductionLayerRestore"
    WHERE "costLayerId" = "InventoryCostLayer"."id"
  ), 0),
  "remainingAmount" = "remainingAmount" + COALESCE((
    SELECT "costAmount" FROM "_DailyProductionLayerRestore"
    WHERE "costLayerId" = "InventoryCostLayer"."id"
  ), 0),
  "status" = 'OPEN'
WHERE "id" IN (SELECT "costLayerId" FROM "_DailyProductionLayerRestore");

UPDATE "Stock"
SET
  "qty" = ROUND("qty" - COALESCE((
    SELECT "qty" FROM "_DailyProductionStockNet" WHERE "stockId" = "Stock"."id"
  ), 0), 6),
  "availableQty" = ROUND("availableQty" - COALESCE((
    SELECT "qty" FROM "_DailyProductionStockNet" WHERE "stockId" = "Stock"."id"
  ), 0), 6),
  "valuationQty" = ROUND("valuationQty" - COALESCE((
    SELECT "valuationQty" FROM "_DailyProductionStockNet" WHERE "stockId" = "Stock"."id"
  ), 0), 6),
  "availableValuationQty" = ROUND("availableValuationQty" - COALESCE((
    SELECT "valuationQty" FROM "_DailyProductionStockNet" WHERE "stockId" = "Stock"."id"
  ), 0), 6),
  "totalCost" = ROUND("totalCost" - COALESCE((
    SELECT "costAmount" FROM "_DailyProductionStockNet" WHERE "stockId" = "Stock"."id"
  ), 0), 6)
WHERE "id" IN (SELECT "stockId" FROM "_DailyProductionStockNet");

UPDATE "Stock"
SET
  "valuationUnitCost" = CASE WHEN "valuationQty" > 0 THEN "totalCost" / "valuationQty" ELSE 0 END,
  "stockUnitCost" = CASE WHEN "qty" > 0 THEN "totalCost" / "qty" ELSE 0 END
WHERE "id" IN (SELECT "stockId" FROM "_DailyProductionStockNet");

UPDATE "StockLocationBalance"
SET
  "qty" = ROUND("qty" - COALESCE((
    SELECT "qty" FROM "_DailyProductionLocationNet"
    WHERE "stockId" = "StockLocationBalance"."stockId"
      AND "locationId" = "StockLocationBalance"."locationId"
  ), 0), 6),
  "availableQty" = ROUND("availableQty" - COALESCE((
    SELECT "qty" FROM "_DailyProductionLocationNet"
    WHERE "stockId" = "StockLocationBalance"."stockId"
      AND "locationId" = "StockLocationBalance"."locationId"
  ), 0), 6)
WHERE EXISTS (
  SELECT 1 FROM "_DailyProductionLocationNet"
  WHERE "stockId" = "StockLocationBalance"."stockId"
    AND "locationId" = "StockLocationBalance"."locationId"
);

DELETE FROM "CostLayerConsumption"
WHERE "costLayerId" IN (
  SELECT "id" FROM "InventoryCostLayer" WHERE "sourceType" = 'DAILY_PRODUCTION_REPORT'
);
DELETE FROM "InventoryCostLayer" WHERE "sourceType" = 'DAILY_PRODUCTION_REPORT';
DELETE FROM "StockLog"
WHERE "refType" IN ('DAILY_PRODUCTION_REPORT', 'DAILY_PRODUCTION_REPORT_REVERSE');
DELETE FROM "AuditLog" WHERE "entityType" = 'DAILY_PRODUCTION_REPORT';
DELETE FROM "DailyProductionReport";

DROP TABLE "_DailyProductionLayerRestore";
DROP TABLE "_DailyProductionLocationNet";
DROP TABLE "_DailyProductionStockNet";

-- Recreate the empty pre-production tables with the new required snapshot fields.
DROP TABLE "DailyProductionConsumption";
DROP TABLE "DailyProductionReport";

CREATE TABLE "DailyProductionReport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reportNo" TEXT NOT NULL,
  "reportDate" DATETIME NOT NULL,
  "finishedMaterialId" TEXT NOT NULL,
  "consumptionLocationId" TEXT,
  "outputLocationId" TEXT,
  "outputQty" REAL NOT NULL DEFAULT 0,
  "workers" TEXT NOT NULL,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "bomId" TEXT NOT NULL,
  "bomName" TEXT NOT NULL,
  "bomVersion" TEXT NOT NULL,
  "bomType" TEXT NOT NULL,
  "bomOutputQuantity" REAL NOT NULL,
  "bomOutputUnit" TEXT NOT NULL,
  "outputValuationQty" REAL NOT NULL DEFAULT 0,
  "outputCostAmount" REAL NOT NULL DEFAULT 0,
  "outputStockUnit" TEXT,
  "outputValuationUnit" TEXT,
  "outputConversionRate" REAL,
  "outputConversionSource" TEXT,
  "confirmedAt" DATETIME,
  "confirmedBy" TEXT,
  "reversedAt" DATETIME,
  "reversedBy" TEXT,
  "reverseReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "DailyProductionReport_finishedMaterialId_fkey"
    FOREIGN KEY ("finishedMaterialId") REFERENCES "Material"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DailyProductionReport_consumptionLocationId_fkey"
    FOREIGN KEY ("consumptionLocationId") REFERENCES "InventoryLocation"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DailyProductionReport_outputLocationId_fkey"
    FOREIGN KEY ("outputLocationId") REFERENCES "InventoryLocation"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DailyProductionReport_reportNo_key" ON "DailyProductionReport"("reportNo");
CREATE INDEX "DailyProductionReport_reportDate_idx" ON "DailyProductionReport"("reportDate");
CREATE INDEX "DailyProductionReport_finishedMaterialId_idx" ON "DailyProductionReport"("finishedMaterialId");
CREATE INDEX "DailyProductionReport_status_idx" ON "DailyProductionReport"("status");

CREATE TABLE "DailyProductionConsumption" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reportId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "bomItemId" TEXT,
  "materialCode" TEXT NOT NULL,
  "materialName" TEXT NOT NULL,
  "quantityPerUnit" REAL NOT NULL,
  "wastageRate" REAL NOT NULL DEFAULT 0,
  "lossMode" TEXT NOT NULL DEFAULT 'MANUAL',
  "lossValue" REAL NOT NULL DEFAULT 0,
  "lossQty" REAL NOT NULL DEFAULT 0,
  "plannedQty" REAL NOT NULL,
  "actualQty" REAL NOT NULL,
  "unit" TEXT NOT NULL,
  "valuationQty" REAL NOT NULL DEFAULT 0,
  "valuationUnit" TEXT,
  "costAmount" REAL NOT NULL DEFAULT 0,
  "conversionRateUsed" REAL,
  "conversionSource" TEXT,
  "costingMethod" TEXT,
  "costLayerSnapshot" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyProductionConsumption_reportId_fkey"
    FOREIGN KEY ("reportId") REFERENCES "DailyProductionReport"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DailyProductionConsumption_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "Material"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DailyProductionConsumption_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "DailyProductionConsumption_reportId_idx" ON "DailyProductionConsumption"("reportId");
CREATE INDEX "DailyProductionConsumption_materialId_idx" ON "DailyProductionConsumption"("materialId");
CREATE INDEX "DailyProductionConsumption_locationId_idx"
ON "DailyProductionConsumption"("locationId");
