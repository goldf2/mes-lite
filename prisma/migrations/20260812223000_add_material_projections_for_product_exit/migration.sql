-- Stage 1B-2 expand phase: add nullable Material projections without rebuilding
-- existing SQLite business tables. Physical foreign keys are intentionally
-- deferred until explicit mapping, backfill, reconciliation, and rollback drills pass.

ALTER TABLE "Product" ADD COLUMN "materialId" TEXT;
ALTER TABLE "BOM" ADD COLUMN "materialId" TEXT;
ALTER TABLE "BomCostRun" ADD COLUMN "materialId" TEXT;
ALTER TABLE "ProcessRoute" ADD COLUMN "materialId" TEXT;
ALTER TABLE "SawingCostScenario" ADD COLUMN "materialId" TEXT;
ALTER TABLE "StockIn" ADD COLUMN "materialId" TEXT;

CREATE UNIQUE INDEX "Product_materialId_key" ON "Product"("materialId");
CREATE INDEX "BOM_materialId_idx" ON "BOM"("materialId");
CREATE INDEX "BomCostRun_materialId_createdAt_idx" ON "BomCostRun"("materialId", "createdAt");
CREATE INDEX "ProcessRoute_materialId_idx" ON "ProcessRoute"("materialId");
CREATE INDEX "SawingCostScenario_materialId_idx" ON "SawingCostScenario"("materialId");
CREATE INDEX "StockIn_materialId_idx" ON "StockIn"("materialId");
