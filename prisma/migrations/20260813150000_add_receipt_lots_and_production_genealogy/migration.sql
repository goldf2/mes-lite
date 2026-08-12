ALTER TABLE "InventoryLot" ADD COLUMN "materialInId" TEXT REFERENCES "MaterialIn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "InventoryLot_materialInId_key" ON "InventoryLot"("materialInId");

CREATE TABLE "InventoryLotAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actualInputId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "inventoryStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "stockQty" REAL NOT NULL,
    "valuationQty" REAL NOT NULL DEFAULT 0,
    "costAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reversedAt" DATETIME,
    "reversedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryLotAllocation_actualInputId_fkey" FOREIGN KEY ("actualInputId") REFERENCES "ProductionOrderActualInput" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryLotAllocation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryLotAllocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "InventoryLotGenealogy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inputAllocationId" TEXT NOT NULL,
    "parentLotId" TEXT NOT NULL,
    "childLotId" TEXT NOT NULL,
    "actualId" TEXT NOT NULL,
    "outputId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reversedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryLotGenealogy_inputAllocationId_fkey" FOREIGN KEY ("inputAllocationId") REFERENCES "InventoryLotAllocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryLotGenealogy_parentLotId_fkey" FOREIGN KEY ("parentLotId") REFERENCES "InventoryLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryLotGenealogy_childLotId_fkey" FOREIGN KEY ("childLotId") REFERENCES "InventoryLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryLotGenealogy_actualId_fkey" FOREIGN KEY ("actualId") REFERENCES "ProductionOrderActual" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryLotGenealogy_outputId_fkey" FOREIGN KEY ("outputId") REFERENCES "ProductionOrderActualOutput" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "InventoryLotAllocation_actualInputId_lotId_locationId_key" ON "InventoryLotAllocation"("actualInputId", "lotId", "locationId");
CREATE INDEX "InventoryLotAllocation_lotId_status_idx" ON "InventoryLotAllocation"("lotId", "status");
CREATE INDEX "InventoryLotAllocation_actualInputId_status_idx" ON "InventoryLotAllocation"("actualInputId", "status");
CREATE INDEX "InventoryLotAllocation_locationId_status_idx" ON "InventoryLotAllocation"("locationId", "status");
CREATE UNIQUE INDEX "InventoryLotGenealogy_inputAllocationId_childLotId_key" ON "InventoryLotGenealogy"("inputAllocationId", "childLotId");
CREATE INDEX "InventoryLotGenealogy_parentLotId_status_idx" ON "InventoryLotGenealogy"("parentLotId", "status");
CREATE INDEX "InventoryLotGenealogy_childLotId_status_idx" ON "InventoryLotGenealogy"("childLotId", "status");
CREATE INDEX "InventoryLotGenealogy_actualId_idx" ON "InventoryLotGenealogy"("actualId");
CREATE INDEX "InventoryLotGenealogy_outputId_idx" ON "InventoryLotGenealogy"("outputId");
