-- Explicit rework inventory state; existing records remain unchanged at zero.
ALTER TABLE "Stock" ADD COLUMN "reworkQty" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Stock" ADD COLUMN "reworkValuationQty" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Stock" ADD COLUMN "reworkCost" REAL NOT NULL DEFAULT 0;
ALTER TABLE "StockLocationBalance" ADD COLUMN "reworkQty" REAL NOT NULL DEFAULT 0;

-- Preserve inspection rounds without rewriting historical decisions.
ALTER TABLE "QualityInspection" ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "QualityInspection" ADD COLUMN "parentInspectionId" TEXT REFERENCES "QualityInspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityInspection" ADD COLUMN "requestedByDispositionId" TEXT REFERENCES "QualityDisposition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "QualityInspection_requestedByDispositionId_key" ON "QualityInspection"("requestedByDispositionId");
CREATE INDEX "QualityInspection_parentInspectionId_round_idx" ON "QualityInspection"("parentInspectionId", "round");

-- One immutable row per quality decision or subsequent disposition action.
CREATE TABLE "QualityDisposition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dispositionNo" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "sourceStatus" TEXT,
    "targetStatus" TEXT,
    "stockQty" REAL NOT NULL,
    "valuationQty" REAL NOT NULL DEFAULT 0,
    "costAmount" REAL NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "performedBy" TEXT NOT NULL,
    "performedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityDisposition_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "QualityInspection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityDisposition_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "QualityDisposition_dispositionNo_key" ON "QualityDisposition"("dispositionNo");
CREATE UNIQUE INDEX "QualityDisposition_operationId_key" ON "QualityDisposition"("operationId");
CREATE INDEX "QualityDisposition_inspectionId_performedAt_idx" ON "QualityDisposition"("inspectionId", "performedAt");
CREATE INDEX "QualityDisposition_lotId_performedAt_idx" ON "QualityDisposition"("lotId", "performedAt");
CREATE INDEX "QualityDisposition_action_performedAt_idx" ON "QualityDisposition"("action", "performedAt");
