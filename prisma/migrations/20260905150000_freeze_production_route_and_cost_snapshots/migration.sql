-- Freeze the selected process route and planned BOM cost at execution creation time.
-- All columns are nullable so historical orders/reports remain readable.
ALTER TABLE "ProductionOrder" ADD COLUMN "processRouteId" TEXT;
ALTER TABLE "ProductionOrder" ADD COLUMN "processRouteName" TEXT;
ALTER TABLE "ProductionOrder" ADD COLUMN "productionProcessRouteSnapshot" TEXT;
ALTER TABLE "ProductionOrder" ADD COLUMN "bomCostRunId" TEXT REFERENCES "BomCostRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionOrder" ADD COLUMN "productionBomCostSnapshot" TEXT;

ALTER TABLE "ProductionOrderActual" ADD COLUMN "processRouteId" TEXT;
ALTER TABLE "ProductionOrderActual" ADD COLUMN "processRouteName" TEXT;
ALTER TABLE "ProductionOrderActual" ADD COLUMN "productionProcessRouteSnapshot" TEXT;
ALTER TABLE "ProductionOrderActual" ADD COLUMN "bomCostRunId" TEXT REFERENCES "BomCostRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionOrderActual" ADD COLUMN "productionBomCostSnapshot" TEXT;

ALTER TABLE "DailyProductionReport" ADD COLUMN "processRouteId" TEXT;
ALTER TABLE "DailyProductionReport" ADD COLUMN "processRouteName" TEXT;
ALTER TABLE "DailyProductionReport" ADD COLUMN "productionProcessRouteSnapshot" TEXT;
ALTER TABLE "DailyProductionReport" ADD COLUMN "bomCostRunId" TEXT REFERENCES "BomCostRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DailyProductionReport" ADD COLUMN "productionBomCostSnapshot" TEXT;

ALTER TABLE "BomCostRun" ADD COLUMN "bomProcessRouteSnapshot" TEXT;

CREATE INDEX "ProductionOrder_processRouteId_idx" ON "ProductionOrder"("processRouteId");
CREATE INDEX "ProductionOrder_bomCostRunId_idx" ON "ProductionOrder"("bomCostRunId");
CREATE INDEX "ProductionOrderActual_processRouteId_idx" ON "ProductionOrderActual"("processRouteId");
CREATE INDEX "ProductionOrderActual_bomCostRunId_idx" ON "ProductionOrderActual"("bomCostRunId");
CREATE INDEX "DailyProductionReport_processRouteId_idx" ON "DailyProductionReport"("processRouteId");
CREATE INDEX "DailyProductionReport_bomCostRunId_idx" ON "DailyProductionReport"("bomCostRunId");
