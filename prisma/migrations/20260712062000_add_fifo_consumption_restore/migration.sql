-- FIFO issue traceability and exact reversal support for existing databases.

ALTER TABLE "InventoryCostLayer" ADD COLUMN "remainingAmount" REAL NOT NULL DEFAULT 0;

UPDATE "InventoryCostLayer"
SET "remainingAmount" = "remainingStockQty" * "stockUnitCost"
WHERE "remainingAmount" = 0;

CREATE TABLE "CostLayerConsumption" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pickItemId" TEXT NOT NULL,
  "costLayerId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "stockQty" REAL NOT NULL,
  "valuationQty" REAL NOT NULL,
  "costAmount" REAL NOT NULL,
  "stockUnitCost" REAL NOT NULL,
  "valuationUnitCost" REAL NOT NULL,
  "restoredAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CostLayerConsumption_pickItemId_fkey" FOREIGN KEY ("pickItemId") REFERENCES "PickItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CostLayerConsumption_costLayerId_fkey" FOREIGN KEY ("costLayerId") REFERENCES "InventoryCostLayer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "CostLayerConsumption_pickItemId_idx" ON "CostLayerConsumption"("pickItemId");
CREATE INDEX "CostLayerConsumption_costLayerId_idx" ON "CostLayerConsumption"("costLayerId");
CREATE INDEX "CostLayerConsumption_materialId_idx" ON "CostLayerConsumption"("materialId");
CREATE INDEX "CostLayerConsumption_restoredAt_idx" ON "CostLayerConsumption"("restoredAt");
