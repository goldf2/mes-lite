ALTER TABLE "Stock" ADD COLUMN "quarantineQty" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Stock" ADD COLUMN "holdQty" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Stock" ADD COLUMN "quarantineValuationQty" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Stock" ADD COLUMN "holdValuationQty" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Stock" ADD COLUMN "quarantineCost" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Stock" ADD COLUMN "holdCost" REAL NOT NULL DEFAULT 0;

ALTER TABLE "StockLocationBalance" ADD COLUMN "quarantineQty" REAL NOT NULL DEFAULT 0;
ALTER TABLE "StockLocationBalance" ADD COLUMN "holdQty" REAL NOT NULL DEFAULT 0;

ALTER TABLE "StockLog" ADD COLUMN "lotId" TEXT;
ALTER TABLE "StockLog" ADD COLUMN "inventoryStatus" TEXT;
ALTER TABLE "StockLog" ADD COLUMN "fromInventoryStatus" TEXT;
ALTER TABLE "StockLog" ADD COLUMN "toInventoryStatus" TEXT;

CREATE TABLE "InventoryLot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lotNo" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "productionOutputId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "supplierLotNo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" DATETIME,
    "reversedBy" TEXT,
    "reverseReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryLot_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryLot_productionOutputId_fkey" FOREIGN KEY ("productionOutputId") REFERENCES "ProductionOrderActualOutput" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "InventoryCostLayer" ADD COLUMN "inventoryStatus" TEXT NOT NULL DEFAULT 'AVAILABLE';
ALTER TABLE "InventoryCostLayer" ADD COLUMN "lotId" TEXT REFERENCES "InventoryLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InventoryLotBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lotId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "inventoryStatus" TEXT NOT NULL,
    "stockQty" REAL NOT NULL DEFAULT 0,
    "valuationQty" REAL NOT NULL DEFAULT 0,
    "costAmount" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryLotBalance_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryLotBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "InventoryLotTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lotId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "stockQty" REAL NOT NULL,
    "valuationQty" REAL NOT NULL,
    "costAmount" REAL NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "stockLogId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryLotTransaction_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryLotTransaction_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "QualityInspection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inspectionNo" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "inspectedQty" REAL NOT NULL DEFAULT 0,
    "sampleQty" REAL NOT NULL DEFAULT 0,
    "goodQty" REAL NOT NULL DEFAULT 0,
    "badQty" REAL NOT NULL DEFAULT 0,
    "inspector" TEXT,
    "checkedAt" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QualityInspection_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "InventoryLot_lotNo_key" ON "InventoryLot"("lotNo");
CREATE UNIQUE INDEX "InventoryLot_productionOutputId_key" ON "InventoryLot"("productionOutputId");
CREATE INDEX "InventoryLot_materialId_status_idx" ON "InventoryLot"("materialId", "status");
CREATE INDEX "InventoryLot_sourceType_sourceId_idx" ON "InventoryLot"("sourceType", "sourceId");
CREATE INDEX "InventoryLot_supplierLotNo_idx" ON "InventoryLot"("supplierLotNo");
CREATE UNIQUE INDEX "InventoryLotBalance_lotId_locationId_inventoryStatus_key" ON "InventoryLotBalance"("lotId", "locationId", "inventoryStatus");
CREATE INDEX "InventoryLotBalance_locationId_inventoryStatus_idx" ON "InventoryLotBalance"("locationId", "inventoryStatus");
CREATE INDEX "InventoryLotBalance_inventoryStatus_idx" ON "InventoryLotBalance"("inventoryStatus");
CREATE UNIQUE INDEX "InventoryLotTransaction_idempotencyKey_key" ON "InventoryLotTransaction"("idempotencyKey");
CREATE INDEX "InventoryLotTransaction_lotId_createdAt_idx" ON "InventoryLotTransaction"("lotId", "createdAt");
CREATE INDEX "InventoryLotTransaction_refType_refId_idx" ON "InventoryLotTransaction"("refType", "refId");
CREATE UNIQUE INDEX "QualityInspection_inspectionNo_key" ON "QualityInspection"("inspectionNo");
CREATE INDEX "QualityInspection_lotId_status_idx" ON "QualityInspection"("lotId", "status");
CREATE INDEX "QualityInspection_status_createdAt_idx" ON "QualityInspection"("status", "createdAt");
CREATE INDEX "QualityInspection_sourceType_sourceId_idx" ON "QualityInspection"("sourceType", "sourceId");
CREATE INDEX "StockLog_lotId_idx" ON "StockLog"("lotId");
CREATE INDEX "InventoryCostLayer_lotId_idx" ON "InventoryCostLayer"("lotId");
CREATE INDEX "InventoryCostLayer_inventoryStatus_status_idx" ON "InventoryCostLayer"("inventoryStatus", "status");
