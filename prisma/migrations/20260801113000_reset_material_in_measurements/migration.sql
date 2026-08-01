-- 来料单尚未正式投入使用：一次性清理旧测试单据及受影响物料的测试库存轨迹，保留物料和供应商主数据。
CREATE TEMP TABLE "_MaterialInTestIds" AS
SELECT "id" FROM "MaterialIn";

CREATE TEMP TABLE "_MaterialInTestMaterials" AS
SELECT DISTINCT "materialId" FROM "MaterialIn";

DELETE FROM "ScanCountEvent"
WHERE "sessionId" IN (
  SELECT "id"
  FROM "ScanCountSession"
  WHERE "referenceType" = 'MATERIAL_IN'
    AND "referenceId" IN (SELECT "id" FROM "_MaterialInTestIds")
);

DELETE FROM "ScanCountSession"
WHERE "referenceType" = 'MATERIAL_IN'
  AND "referenceId" IN (SELECT "id" FROM "_MaterialInTestIds");

DELETE FROM "LabelPrintJob"
WHERE "referenceType" = 'MATERIAL_IN'
  AND "referenceId" IN (SELECT "id" FROM "_MaterialInTestIds");

DELETE FROM "DocumentAttachment"
WHERE "ownerType" = 'MATERIAL_IN'
  AND "ownerId" IN (SELECT "id" FROM "_MaterialInTestIds");

DELETE FROM "AuditLog"
WHERE "entityType" = 'MATERIAL_IN'
  AND "entityId" IN (SELECT "id" FROM "_MaterialInTestIds");

DELETE FROM "CostLayerConsumption"
WHERE "materialId" IN (SELECT "materialId" FROM "_MaterialInTestMaterials");

DELETE FROM "InventoryCostLayer"
WHERE "materialId" IN (SELECT "materialId" FROM "_MaterialInTestMaterials");

DELETE FROM "StockLog"
WHERE "stockId" IN (
  SELECT "id"
  FROM "Stock"
  WHERE "materialId" IN (SELECT "materialId" FROM "_MaterialInTestMaterials")
);

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
WHERE "materialId" IN (SELECT "materialId" FROM "_MaterialInTestMaterials");

DELETE FROM "MaterialIn";

DROP TABLE "_MaterialInTestMaterials";
DROP TABLE "_MaterialInTestIds";

ALTER TABLE "MaterialIn" ADD COLUMN "totalLength" REAL;
ALTER TABLE "MaterialIn" ADD COLUMN "totalWeight" REAL;
