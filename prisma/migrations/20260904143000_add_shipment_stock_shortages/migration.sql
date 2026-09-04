CREATE TABLE "ShipmentStockShortage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "shipmentItemId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "stockQty" REAL NOT NULL,
    "settledStockQty" REAL NOT NULL DEFAULT 0,
    "settledValuationQty" REAL NOT NULL DEFAULT 0,
    "settledCostAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "settledAt" DATETIME,
    "reversedAt" DATETIME,
    "reversedBy" TEXT,
    "reverseReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShipmentStockShortage_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShipmentStockShortage_shipmentItemId_fkey" FOREIGN KEY ("shipmentItemId") REFERENCES "ShipmentItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShipmentStockShortage_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShipmentStockShortage_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ShipmentStockShortageSettlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shortageId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "costLayerId" TEXT,
    "stockLogId" TEXT NOT NULL,
    "shipmentAllocationId" TEXT NOT NULL,
    "stockQty" REAL NOT NULL,
    "valuationQty" REAL NOT NULL DEFAULT 0,
    "costAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reversedAt" DATETIME,
    "reversedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShipmentStockShortageSettlement_shortageId_fkey" FOREIGN KEY ("shortageId") REFERENCES "ShipmentStockShortage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShipmentStockShortageSettlement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShipmentStockShortageSettlement_costLayerId_fkey" FOREIGN KEY ("costLayerId") REFERENCES "InventoryCostLayer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShipmentStockShortageSettlement_stockLogId_fkey" FOREIGN KEY ("stockLogId") REFERENCES "StockLog" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShipmentStockShortageSettlement_shipmentAllocationId_fkey" FOREIGN KEY ("shipmentAllocationId") REFERENCES "ShipmentLotAllocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ShipmentStockShortage_shipmentItemId_key" ON "ShipmentStockShortage"("shipmentItemId");
CREATE INDEX "ShipmentStockShortage_materialId_locationId_status_createdAt_idx" ON "ShipmentStockShortage"("materialId", "locationId", "status", "createdAt");
CREATE INDEX "ShipmentStockShortage_shipmentId_status_idx" ON "ShipmentStockShortage"("shipmentId", "status");
CREATE INDEX "ShipmentStockShortageSettlement_shortageId_status_idx" ON "ShipmentStockShortageSettlement"("shortageId", "status");
CREATE INDEX "ShipmentStockShortageSettlement_lotId_status_idx" ON "ShipmentStockShortageSettlement"("lotId", "status");
CREATE INDEX "ShipmentStockShortageSettlement_costLayerId_status_idx" ON "ShipmentStockShortageSettlement"("costLayerId", "status");
CREATE INDEX "ShipmentStockShortageSettlement_shipmentAllocationId_idx" ON "ShipmentStockShortageSettlement"("shipmentAllocationId");
CREATE INDEX "ShipmentStockShortageSettlement_stockLogId_idx" ON "ShipmentStockShortageSettlement"("stockLogId");
