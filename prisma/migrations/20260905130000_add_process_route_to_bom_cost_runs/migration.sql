-- Preserve existing BOM cost snapshots while recording the selected process route.
ALTER TABLE "BomCostRun" ADD COLUMN "processRouteId" TEXT REFERENCES "ProcessRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BomCostRun" ADD COLUMN "processRouteName" TEXT;

CREATE INDEX "BomCostRun_processRouteId_idx" ON "BomCostRun"("processRouteId");
