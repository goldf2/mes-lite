ALTER TABLE "Material" ADD COLUMN "unitMode" TEXT NOT NULL DEFAULT 'DUAL';
ALTER TABLE "Material" ADD COLUMN "unitVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "Material"
SET "unitMode" = CASE
  WHEN "stockUnit" = "valuationUnit" AND ABS("conversionRate" - 1) < 0.000001 THEN 'SINGLE'
  ELSE 'DUAL'
END;

ALTER TABLE "BOM" ADD COLUMN "outputQuantity" REAL NOT NULL DEFAULT 1;
ALTER TABLE "BOM" ADD COLUMN "outputUnit" TEXT NOT NULL DEFAULT '件';

UPDATE "BOM"
SET "outputUnit" = COALESCE((
  SELECT "Material"."stockUnit"
  FROM "Product"
  JOIN "Material"
    ON "Material"."code" = "Product"."sku"
    OR ('MAT-' || "Material"."code") = "Product"."sku"
  WHERE "Product"."id" = "BOM"."productId"
  LIMIT 1
), (
  SELECT "Product"."unit" FROM "Product" WHERE "Product"."id" = "BOM"."productId"
), '件');

ALTER TABLE "MaterialIn" ADD COLUMN "conversionSource" TEXT NOT NULL DEFAULT 'MASTER_DEFAULT';
UPDATE "MaterialIn"
SET "conversionSource" = CASE
  WHEN ABS("conversionRate" - COALESCE((
    SELECT "Material"."conversionRate"
    FROM "Material"
    WHERE "Material"."id" = "MaterialIn"."materialId"
  ), 1)) < 0.000001 THEN 'MASTER_DEFAULT'
  ELSE 'DOCUMENT_ACTUAL'
END;

ALTER TABLE "InventoryCostLayer" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "InventoryCostLayer" ADD COLUMN "sourceId" TEXT;
UPDATE "InventoryCostLayer"
SET "sourceType" = 'MATERIAL_IN', "sourceId" = "materialInId"
WHERE "materialInId" IS NOT NULL;
CREATE INDEX "InventoryCostLayer_sourceType_sourceId_idx"
ON "InventoryCostLayer"("sourceType", "sourceId");

ALTER TABLE "StockLog" ADD COLUMN "stockUnitSnapshot" TEXT;
ALTER TABLE "StockLog" ADD COLUMN "valuationUnitSnapshot" TEXT;
ALTER TABLE "StockLog" ADD COLUMN "conversionRateUsed" REAL;
ALTER TABLE "StockLog" ADD COLUMN "conversionSource" TEXT;
ALTER TABLE "StockLog" ADD COLUMN "costingMethodSnapshot" TEXT;
ALTER TABLE "StockLog" ADD COLUMN "sourceMovementId" TEXT;
ALTER TABLE "StockLog" ADD COLUMN "reversalMovementId" TEXT;
ALTER TABLE "StockLog" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "StockLog_idempotencyKey_key" ON "StockLog"("idempotencyKey");

UPDATE "StockLog"
SET
  "stockUnitSnapshot" = COALESCE((
    SELECT "Material"."stockUnit"
    FROM "Stock"
    JOIN "Material" ON "Material"."id" = "Stock"."materialId"
    WHERE "Stock"."id" = "StockLog"."stockId"
  ), (
    SELECT "Product"."unit"
    FROM "Stock"
    JOIN "Product" ON "Product"."id" = "Stock"."productId"
    WHERE "Stock"."id" = "StockLog"."stockId"
  )),
  "valuationUnitSnapshot" = COALESCE((
    SELECT "Material"."valuationUnit"
    FROM "Stock"
    JOIN "Material" ON "Material"."id" = "Stock"."materialId"
    WHERE "Stock"."id" = "StockLog"."stockId"
  ), (
    SELECT "Product"."unit"
    FROM "Stock"
    JOIN "Product" ON "Product"."id" = "Stock"."productId"
    WHERE "Stock"."id" = "StockLog"."stockId"
  )),
  "conversionRateUsed" = CASE
    WHEN ABS("qty") > 0.000001 AND "valuationQty" IS NOT NULL
      THEN ABS("valuationQty" / "qty")
    ELSE NULL
  END,
  "conversionSource" = 'LEGACY_ESTIMATE';

ALTER TABLE "DailyProductionReport" ADD COLUMN "outputStockUnit" TEXT;
ALTER TABLE "DailyProductionReport" ADD COLUMN "outputValuationUnit" TEXT;
ALTER TABLE "DailyProductionReport" ADD COLUMN "outputConversionRate" REAL;
ALTER TABLE "DailyProductionReport" ADD COLUMN "outputConversionSource" TEXT;
ALTER TABLE "DailyProductionConsumption" ADD COLUMN "valuationUnit" TEXT;
ALTER TABLE "DailyProductionConsumption" ADD COLUMN "conversionSource" TEXT;

ALTER TABLE "Shipment" ADD COLUMN "stockUnitSnapshot" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "valuationUnitSnapshot" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "conversionRateUsed" REAL;
ALTER TABLE "Shipment" ADD COLUMN "conversionSource" TEXT;

ALTER TABLE "ReturnOrder" ADD COLUMN "processedValuationQty" REAL NOT NULL DEFAULT 0;
ALTER TABLE "ReturnOrder" ADD COLUMN "processedCostAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "ReturnOrder" ADD COLUMN "stockUnitSnapshot" TEXT;
ALTER TABLE "ReturnOrder" ADD COLUMN "valuationUnitSnapshot" TEXT;
ALTER TABLE "ReturnOrder" ADD COLUMN "conversionRateUsed" REAL;
ALTER TABLE "ReturnOrder" ADD COLUMN "conversionSource" TEXT;
