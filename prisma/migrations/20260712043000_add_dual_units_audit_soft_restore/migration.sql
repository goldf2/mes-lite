-- Dual-unit material accounting, soft-delete coverage, and operation audit logs.

ALTER TABLE "Material" ADD COLUMN "stockUnit" TEXT NOT NULL DEFAULT '件';
ALTER TABLE "Material" ADD COLUMN "valuationUnit" TEXT NOT NULL DEFAULT 'kg';
ALTER TABLE "Material" ADD COLUMN "conversionRate" REAL NOT NULL DEFAULT 1;
ALTER TABLE "Material" ADD COLUMN "conversionNote" TEXT;
ALTER TABLE "Material" ADD COLUMN "costingMethod" TEXT NOT NULL DEFAULT 'WEIGHTED_AVERAGE';
UPDATE "Material" SET "stockUnit" = "unit" WHERE "stockUnit" = '件';

ALTER TABLE "Stock" ADD COLUMN "valuationQty" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Stock" ADD COLUMN "reservedValuationQty" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Stock" ADD COLUMN "availableValuationQty" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Stock" ADD COLUMN "totalCost" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Stock" ADD COLUMN "valuationUnitCost" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Stock" ADD COLUMN "stockUnitCost" REAL NOT NULL DEFAULT 0;
UPDATE "Stock"
SET
  "valuationQty" = "qty",
  "reservedValuationQty" = "reservedQty",
  "availableValuationQty" = "availableQty";

ALTER TABLE "StockLog" ADD COLUMN "valuationQty" REAL;
ALTER TABLE "StockLog" ADD COLUMN "beforeValuationQty" REAL;
ALTER TABLE "StockLog" ADD COLUMN "afterValuationQty" REAL;
ALTER TABLE "StockLog" ADD COLUMN "costAmount" REAL;
ALTER TABLE "StockLog" ADD COLUMN "beforeCostAmount" REAL;
ALTER TABLE "StockLog" ADD COLUMN "afterCostAmount" REAL;

ALTER TABLE "PickItem" ADD COLUMN "actualValuationQty" REAL NOT NULL DEFAULT 0;
ALTER TABLE "PickItem" ADD COLUMN "conversionRateUsed" REAL;
ALTER TABLE "PickItem" ADD COLUMN "conversionSource" TEXT;
ALTER TABLE "PickItem" ADD COLUMN "costAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "PickItem" ADD COLUMN "costingMethod" TEXT;

ALTER TABLE "MaterialIn" ADD COLUMN "valuationQty" REAL NOT NULL DEFAULT 0;
ALTER TABLE "MaterialIn" ADD COLUMN "valuationUnit" TEXT NOT NULL DEFAULT 'kg';
ALTER TABLE "MaterialIn" ADD COLUMN "conversionRate" REAL NOT NULL DEFAULT 1;
ALTER TABLE "MaterialIn" ADD COLUMN "stockUnitCost" REAL NOT NULL DEFAULT 0;
ALTER TABLE "MaterialIn" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "MaterialIn" ADD COLUMN "deletedBy" TEXT;
UPDATE "MaterialIn"
SET
  "valuationQty" = "qty",
  "valuationUnit" = "unit",
  "conversionRate" = 1;

ALTER TABLE "ProductionOrder" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "ProductionOrder" ADD COLUMN "deletedBy" TEXT;

ALTER TABLE "Dispatch" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Dispatch" ADD COLUMN "deletedBy" TEXT;

ALTER TABLE "Shipment" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Shipment" ADD COLUMN "deletedBy" TEXT;

ALTER TABLE "ReturnOrder" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "ReturnOrder" ADD COLUMN "deletedBy" TEXT;

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "operatorId" TEXT,
  "operatorName" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "entityLabel" TEXT,
  "beforeData" TEXT,
  "afterData" TEXT,
  "note" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_operatorId_idx" ON "AuditLog"("operatorId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

CREATE TABLE "InventoryCostLayer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "materialId" TEXT NOT NULL,
  "materialInId" TEXT,
  "stockQty" REAL NOT NULL,
  "remainingStockQty" REAL NOT NULL,
  "valuationQty" REAL NOT NULL,
  "remainingValuationQty" REAL NOT NULL,
  "stockUnit" TEXT NOT NULL,
  "valuationUnit" TEXT NOT NULL,
  "valuationUnitCost" REAL NOT NULL,
  "stockUnitCost" REAL NOT NULL,
  "totalAmount" REAL NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryCostLayer_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "InventoryCostLayer_materialId_idx" ON "InventoryCostLayer"("materialId");
CREATE INDEX "InventoryCostLayer_materialInId_idx" ON "InventoryCostLayer"("materialInId");
CREATE INDEX "InventoryCostLayer_status_idx" ON "InventoryCostLayer"("status");
