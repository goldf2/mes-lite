-- Add the material-master link used by shipment and return inventory movements.
ALTER TABLE "Shipment" ADD COLUMN "materialId" TEXT
  REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD COLUMN "shippedValuationQty" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Shipment" ADD COLUMN "shippedCostAmount" REAL NOT NULL DEFAULT 0;

ALTER TABLE "ReturnOrder" ADD COLUMN "materialId" TEXT
  REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill the material link from the legacy compatibility product SKU.
UPDATE "Shipment"
SET "materialId" = (
  SELECT "Material"."id"
  FROM "Product"
  JOIN "Material"
    ON "Material"."code" = "Product"."sku"
    OR ('MAT-' || "Material"."code") = "Product"."sku"
  WHERE "Product"."id" = "Shipment"."productId"
  LIMIT 1
)
WHERE "materialId" IS NULL;

UPDATE "ReturnOrder"
SET "materialId" = (
  SELECT "Material"."id"
  FROM "Product"
  JOIN "Material"
    ON "Material"."code" = "Product"."sku"
    OR ('MAT-' || "Material"."code") = "Product"."sku"
  WHERE "Product"."id" = "ReturnOrder"."productId"
  LIMIT 1
)
WHERE "materialId" IS NULL;

CREATE INDEX "Shipment_materialId_idx" ON "Shipment"("materialId");
CREATE INDEX "ReturnOrder_materialId_idx" ON "ReturnOrder"("materialId");

-- Independent daily production report and immutable BOM consumption snapshot.
CREATE TABLE "DailyProductionReport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reportNo" TEXT NOT NULL,
  "reportDate" DATETIME NOT NULL,
  "finishedMaterialId" TEXT NOT NULL,
  "goodQty" REAL NOT NULL DEFAULT 0,
  "badQty" REAL NOT NULL DEFAULT 0,
  "scrapQty" REAL NOT NULL DEFAULT 0,
  "workers" TEXT NOT NULL,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "bomId" TEXT,
  "bomVersion" TEXT,
  "outputValuationQty" REAL NOT NULL DEFAULT 0,
  "outputCostAmount" REAL NOT NULL DEFAULT 0,
  "confirmedAt" DATETIME,
  "confirmedBy" TEXT,
  "reversedAt" DATETIME,
  "reversedBy" TEXT,
  "reverseReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "DailyProductionReport_finishedMaterialId_fkey"
    FOREIGN KEY ("finishedMaterialId") REFERENCES "Material" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DailyProductionReport_reportNo_key" ON "DailyProductionReport"("reportNo");
CREATE INDEX "DailyProductionReport_reportDate_idx" ON "DailyProductionReport"("reportDate");
CREATE INDEX "DailyProductionReport_finishedMaterialId_idx" ON "DailyProductionReport"("finishedMaterialId");
CREATE INDEX "DailyProductionReport_status_idx" ON "DailyProductionReport"("status");

CREATE TABLE "DailyProductionConsumption" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reportId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "bomItemId" TEXT,
  "materialCode" TEXT NOT NULL,
  "materialName" TEXT NOT NULL,
  "quantityPerUnit" REAL NOT NULL,
  "wastageRate" REAL NOT NULL DEFAULT 0,
  "plannedQty" REAL NOT NULL,
  "actualQty" REAL NOT NULL,
  "unit" TEXT NOT NULL,
  "valuationQty" REAL NOT NULL DEFAULT 0,
  "costAmount" REAL NOT NULL DEFAULT 0,
  "conversionRateUsed" REAL,
  "costingMethod" TEXT,
  "costLayerSnapshot" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyProductionConsumption_reportId_fkey"
    FOREIGN KEY ("reportId") REFERENCES "DailyProductionReport" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DailyProductionConsumption_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "Material" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "DailyProductionConsumption_reportId_idx" ON "DailyProductionConsumption"("reportId");
CREATE INDEX "DailyProductionConsumption_materialId_idx" ON "DailyProductionConsumption"("materialId");

-- Merge legacy compatibility-product balances into the material-master stock
-- once, then leave the compatibility records at zero for historical relations.
UPDATE "Stock"
SET
  "qty" = "qty" + COALESCE((
    SELECT SUM("ProductStock"."qty")
    FROM "Stock" AS "ProductStock"
    JOIN "Product" ON "Product"."id" = "ProductStock"."productId"
    JOIN "Material" ON
      "Material"."code" = "Product"."sku"
      OR ('MAT-' || "Material"."code") = "Product"."sku"
    WHERE "Material"."id" = "Stock"."materialId"
  ), 0),
  "availableQty" = "availableQty" + COALESCE((
    SELECT SUM("ProductStock"."availableQty")
    FROM "Stock" AS "ProductStock"
    JOIN "Product" ON "Product"."id" = "ProductStock"."productId"
    JOIN "Material" ON
      "Material"."code" = "Product"."sku"
      OR ('MAT-' || "Material"."code") = "Product"."sku"
    WHERE "Material"."id" = "Stock"."materialId"
  ), 0),
  "reservedQty" = "reservedQty" + COALESCE((
    SELECT SUM("ProductStock"."reservedQty")
    FROM "Stock" AS "ProductStock"
    JOIN "Product" ON "Product"."id" = "ProductStock"."productId"
    JOIN "Material" ON
      "Material"."code" = "Product"."sku"
      OR ('MAT-' || "Material"."code") = "Product"."sku"
    WHERE "Material"."id" = "Stock"."materialId"
  ), 0),
  "valuationQty" = "valuationQty" + COALESCE((
    SELECT SUM("ProductStock"."valuationQty")
    FROM "Stock" AS "ProductStock"
    JOIN "Product" ON "Product"."id" = "ProductStock"."productId"
    JOIN "Material" ON
      "Material"."code" = "Product"."sku"
      OR ('MAT-' || "Material"."code") = "Product"."sku"
    WHERE "Material"."id" = "Stock"."materialId"
  ), 0),
  "availableValuationQty" = "availableValuationQty" + COALESCE((
    SELECT SUM("ProductStock"."availableValuationQty")
    FROM "Stock" AS "ProductStock"
    JOIN "Product" ON "Product"."id" = "ProductStock"."productId"
    JOIN "Material" ON
      "Material"."code" = "Product"."sku"
      OR ('MAT-' || "Material"."code") = "Product"."sku"
    WHERE "Material"."id" = "Stock"."materialId"
  ), 0),
  "reservedValuationQty" = "reservedValuationQty" + COALESCE((
    SELECT SUM("ProductStock"."reservedValuationQty")
    FROM "Stock" AS "ProductStock"
    JOIN "Product" ON "Product"."id" = "ProductStock"."productId"
    JOIN "Material" ON
      "Material"."code" = "Product"."sku"
      OR ('MAT-' || "Material"."code") = "Product"."sku"
    WHERE "Material"."id" = "Stock"."materialId"
  ), 0),
  "totalCost" = "totalCost" + COALESCE((
    SELECT SUM("ProductStock"."totalCost")
    FROM "Stock" AS "ProductStock"
    JOIN "Product" ON "Product"."id" = "ProductStock"."productId"
    JOIN "Material" ON
      "Material"."code" = "Product"."sku"
      OR ('MAT-' || "Material"."code") = "Product"."sku"
    WHERE "Material"."id" = "Stock"."materialId"
  ), 0)
WHERE "materialId" IS NOT NULL;

UPDATE "Stock"
SET
  "valuationUnitCost" = CASE WHEN "valuationQty" > 0 THEN "totalCost" / "valuationQty" ELSE 0 END,
  "stockUnitCost" = CASE WHEN "qty" > 0 THEN "totalCost" / "qty" ELSE 0 END
WHERE "materialId" IS NOT NULL;

UPDATE "Stock"
SET
  "qty" = 0,
  "reservedQty" = 0,
  "availableQty" = 0,
  "valuationQty" = 0,
  "reservedValuationQty" = 0,
  "availableValuationQty" = 0,
  "totalCost" = 0,
  "valuationUnitCost" = 0,
  "stockUnitCost" = 0
WHERE "productId" IN (
  SELECT "Product"."id"
  FROM "Product"
  JOIN "Material" ON
    "Material"."code" = "Product"."sku"
    OR ('MAT-' || "Material"."code") = "Product"."sku"
);

-- Production reports are operational documents, so entry users need to create
-- and confirm them without receiving broader statistics or system privileges.
UPDATE "PermissionSetting"
SET "canCreate" = 1, "canUpdate" = 1
WHERE "resource" = 'stats' AND "role" IN ('OPERATOR', 'AUDITOR');

UPDATE "PermissionGroupSetting"
SET "canCreate" = 1, "canUpdate" = 1
WHERE "resource" = 'stats'
  AND "groupId" IN (
    SELECT "id" FROM "PermissionGroup"
    WHERE "code" IN ('basic_entry', 'business_audit')
  );
