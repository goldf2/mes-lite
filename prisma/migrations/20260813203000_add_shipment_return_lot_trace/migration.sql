-- Add shipment trace state without rewriting historical shipment records.
ALTER TABLE "Shipment" ADD COLUMN "lotTraceStatus" TEXT NOT NULL DEFAULT 'PENDING';

-- A processed return owns one independently inspectable inventory lot.
ALTER TABLE "InventoryLot" ADD COLUMN "returnOrderId" TEXT REFERENCES "ReturnOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "InventoryLot_returnOrderId_key" ON "InventoryLot"("returnOrderId");

-- Record which internal lots were delivered to the customer.
CREATE TABLE "ShipmentLotAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "inventoryStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "stockQty" REAL NOT NULL,
    "valuationQty" REAL NOT NULL DEFAULT 0,
    "costAmount" REAL NOT NULL DEFAULT 0,
    "returnedStockQty" REAL NOT NULL DEFAULT 0,
    "returnedValuationQty" REAL NOT NULL DEFAULT 0,
    "returnedCostAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShipmentLotAllocation_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShipmentLotAllocation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShipmentLotAllocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ShipmentLotAllocation_shipmentId_status_idx" ON "ShipmentLotAllocation"("shipmentId", "status");
CREATE INDEX "ShipmentLotAllocation_lotId_status_idx" ON "ShipmentLotAllocation"("lotId", "status");
CREATE INDEX "ShipmentLotAllocation_locationId_status_idx" ON "ShipmentLotAllocation"("locationId", "status");
CREATE UNIQUE INDEX "ShipmentLotAllocation_shipmentId_lotId_locationId_key" ON "ShipmentLotAllocation"("shipmentId", "lotId", "locationId");

-- Preserve the exact original shipment-lot slice behind each returned lot.
CREATE TABLE "ReturnLotAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "returnOrderId" TEXT NOT NULL,
    "shipmentAllocationId" TEXT NOT NULL,
    "returnedLotId" TEXT NOT NULL,
    "stockQty" REAL NOT NULL,
    "valuationQty" REAL NOT NULL DEFAULT 0,
    "costAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReturnLotAllocation_returnOrderId_fkey" FOREIGN KEY ("returnOrderId") REFERENCES "ReturnOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReturnLotAllocation_shipmentAllocationId_fkey" FOREIGN KEY ("shipmentAllocationId") REFERENCES "ShipmentLotAllocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReturnLotAllocation_returnedLotId_fkey" FOREIGN KEY ("returnedLotId") REFERENCES "InventoryLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ReturnLotAllocation_returnOrderId_status_idx" ON "ReturnLotAllocation"("returnOrderId", "status");
CREATE INDEX "ReturnLotAllocation_shipmentAllocationId_status_idx" ON "ReturnLotAllocation"("shipmentAllocationId", "status");
CREATE INDEX "ReturnLotAllocation_returnedLotId_status_idx" ON "ReturnLotAllocation"("returnedLotId", "status");
CREATE UNIQUE INDEX "ReturnLotAllocation_returnOrderId_shipmentAllocationId_key" ON "ReturnLotAllocation"("returnOrderId", "shipmentAllocationId");
