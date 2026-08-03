ALTER TABLE "ProductionOrder" ADD COLUMN "bomId" TEXT REFERENCES "BOM"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionOrder" ADD COLUMN "bomName" TEXT;
ALTER TABLE "ProductionOrder" ADD COLUMN "bomVersion" TEXT;
ALTER TABLE "ProductionOrder" ADD COLUMN "productionBomSnapshot" TEXT;

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_ProductionOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNo" TEXT NOT NULL,
    "voucherNo" TEXT,
    "productId" TEXT NOT NULL,
    "materialId" TEXT,
    "bomId" TEXT,
    "bomName" TEXT,
    "bomVersion" TEXT,
    "productionBomSnapshot" TEXT,
    "planQty" REAL NOT NULL,
    "completeQty" REAL NOT NULL DEFAULT 0,
    "scrapQty" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "planId" TEXT,
    "note" TEXT,
    "startTime" DATETIME,
    "completeTime" DATETIME,
    "cancelTime" DATETIME,
    "cancelReason" TEXT,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductionOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrder_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrder_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "BOM" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_ProductionOrder" (
    "id", "orderNo", "voucherNo", "productId", "materialId", "bomId", "bomName", "bomVersion",
    "productionBomSnapshot", "planQty", "completeQty", "scrapQty", "status", "planId", "note",
    "startTime", "completeTime", "cancelTime", "cancelReason", "deletedAt", "deletedBy", "createdAt", "updatedAt"
)
SELECT
    "id", "orderNo", "voucherNo", "productId", "materialId", "bomId", "bomName", "bomVersion",
    "productionBomSnapshot", "planQty", "completeQty", "scrapQty", "status", "planId", "note",
    "startTime", "completeTime", "cancelTime", "cancelReason", "deletedAt", "deletedBy", "createdAt", "updatedAt"
FROM "ProductionOrder";

DROP TABLE "ProductionOrder";
ALTER TABLE "new_ProductionOrder" RENAME TO "ProductionOrder";

CREATE UNIQUE INDEX "ProductionOrder_orderNo_key" ON "ProductionOrder"("orderNo");
CREATE INDEX "ProductionOrder_materialId_idx" ON "ProductionOrder"("materialId");
CREATE INDEX "ProductionOrder_bomId_idx" ON "ProductionOrder"("bomId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE TABLE "ProductionOrderActual" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actualNo" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actualDate" DATETIME NOT NULL,
    "workers" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "confirmedAt" DATETIME,
    "confirmedBy" TEXT,
    "reversedAt" DATETIME,
    "reversedBy" TEXT,
    "reverseReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductionOrderActual_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductionOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProductionOrderActual_actualNo_key" ON "ProductionOrderActual"("actualNo");
CREATE INDEX "ProductionOrderActual_orderId_actualDate_idx" ON "ProductionOrderActual"("orderId", "actualDate");
CREATE INDEX "ProductionOrderActual_status_idx" ON "ProductionOrderActual"("status");

CREATE TABLE "ProductionOrderActualEmployee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actualId" TEXT NOT NULL,
    "employeeId" TEXT,
    "employeeCode" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionOrderActualEmployee_actualId_fkey" FOREIGN KEY ("actualId") REFERENCES "ProductionOrderActual" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrderActualEmployee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ProductionOrderActualEmployee_employeeId_idx" ON "ProductionOrderActualEmployee"("employeeId");
CREATE UNIQUE INDEX "ProductionOrderActualEmployee_actualId_employeeId_key" ON "ProductionOrderActualEmployee"("actualId", "employeeId");

CREATE TABLE "ProductionOrderActualInput" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actualId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "bomItemId" TEXT,
    "materialCode" TEXT NOT NULL,
    "materialName" TEXT NOT NULL,
    "quantityPerBatch" REAL NOT NULL,
    "lossMode" TEXT NOT NULL DEFAULT 'PERCENT',
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
    CONSTRAINT "ProductionOrderActualInput_actualId_fkey" FOREIGN KEY ("actualId") REFERENCES "ProductionOrderActual" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrderActualInput_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrderActualInput_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ProductionOrderActualInput_materialId_idx" ON "ProductionOrderActualInput"("materialId");
CREATE INDEX "ProductionOrderActualInput_locationId_idx" ON "ProductionOrderActualInput"("locationId");
CREATE UNIQUE INDEX "ProductionOrderActualInput_actualId_materialId_key" ON "ProductionOrderActualInput"("actualId", "materialId");

CREATE TABLE "ProductionOrderActualOutput" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actualId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "bomOutputId" TEXT,
    "materialCode" TEXT NOT NULL,
    "materialName" TEXT NOT NULL,
    "quantityPerBatch" REAL NOT NULL,
    "plannedQty" REAL NOT NULL,
    "actualQty" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "valuationQty" REAL NOT NULL DEFAULT 0,
    "costAmount" REAL NOT NULL DEFAULT 0,
    "stockUnit" TEXT,
    "valuationUnit" TEXT,
    "conversionRateUsed" REAL,
    "conversionSource" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionOrderActualOutput_actualId_fkey" FOREIGN KEY ("actualId") REFERENCES "ProductionOrderActual" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrderActualOutput_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrderActualOutput_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ProductionOrderActualOutput_materialId_idx" ON "ProductionOrderActualOutput"("materialId");
CREATE INDEX "ProductionOrderActualOutput_locationId_idx" ON "ProductionOrderActualOutput"("locationId");
CREATE INDEX "ProductionOrderActualOutput_actualId_isPrimary_idx" ON "ProductionOrderActualOutput"("actualId", "isPrimary");
CREATE UNIQUE INDEX "ProductionOrderActualOutput_actualId_materialId_key" ON "ProductionOrderActualOutput"("actualId", "materialId");
