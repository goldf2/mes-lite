CREATE TABLE "CostObject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objectType" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "unit" TEXT NOT NULL DEFAULT '件',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "CostObjectCost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "costObjectId" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "materialCostPerUnit" REAL NOT NULL DEFAULT 0,
    "laborHoursPerUnit" REAL NOT NULL DEFAULT 0,
    "machineHoursPerUnit" REAL NOT NULL DEFAULT 0,
    "directCostPerUnit" REAL NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CostObjectCost_costObjectId_fkey" FOREIGN KEY ("costObjectId") REFERENCES "CostObject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BomCostRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "bomId" TEXT,
    "bomVersion" TEXT,
    "quantityBasis" REAL NOT NULL DEFAULT 1,
    "laborRatePerHour" REAL NOT NULL DEFAULT 0,
    "machineRatePerHour" REAL NOT NULL DEFAULT 0,
    "overheadCost" REAL NOT NULL DEFAULT 0,
    "totalMaterialCost" REAL NOT NULL DEFAULT 0,
    "totalLaborCost" REAL NOT NULL DEFAULT 0,
    "totalMachineCost" REAL NOT NULL DEFAULT 0,
    "totalDirectCost" REAL NOT NULL DEFAULT 0,
    "totalCost" REAL NOT NULL DEFAULT 0,
    "unitCost" REAL NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BomCostRun_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BomCostRun_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "BOM" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "BomCostRunLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "lineType" TEXT NOT NULL,
    "sourceId" TEXT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "unitCost" REAL NOT NULL DEFAULT 0,
    "materialCost" REAL NOT NULL DEFAULT 0,
    "laborHours" REAL NOT NULL DEFAULT 0,
    "machineHours" REAL NOT NULL DEFAULT 0,
    "laborCost" REAL NOT NULL DEFAULT 0,
    "machineCost" REAL NOT NULL DEFAULT 0,
    "directCost" REAL NOT NULL DEFAULT 0,
    "totalCost" REAL NOT NULL DEFAULT 0,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BomCostRunLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "BomCostRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "BOMItem" ADD COLUMN "costObjectId" TEXT REFERENCES "CostObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CostObject_code_key" ON "CostObject"("code");
CREATE INDEX "CostObject_sourceType_sourceId_idx" ON "CostObject"("sourceType", "sourceId");
CREATE INDEX "CostObjectCost_costObjectId_active_idx" ON "CostObjectCost"("costObjectId", "active");
CREATE INDEX "BomCostRun_productId_createdAt_idx" ON "BomCostRun"("productId", "createdAt");
CREATE INDEX "BomCostRun_bomId_idx" ON "BomCostRun"("bomId");
CREATE INDEX "BomCostRunLine_runId_idx" ON "BomCostRunLine"("runId");
CREATE INDEX "BOMItem_costObjectId_idx" ON "BOMItem"("costObjectId");
