-- 将冻结 BOM 成本在实际生产过账时拆分为实际材料成本和增值加工成本。
ALTER TABLE "ProductionOrderActual" ADD COLUMN "actualMaterialCostAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "ProductionOrderActual" ADD COLUMN "actualProcessCostAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "ProductionOrderActual" ADD COLUMN "productionAppliedCostSnapshot" TEXT;
ALTER TABLE "ProductionOrderActualOutput" ADD COLUMN "materialCostAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "ProductionOrderActualOutput" ADD COLUMN "processCostAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "DailyProductionReport" ADD COLUMN "actualMaterialCostAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "DailyProductionReport" ADD COLUMN "actualProcessCostAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "DailyProductionReport" ADD COLUMN "productionAppliedCostSnapshot" TEXT;
ALTER TABLE "DailyProductionOutput" ADD COLUMN "materialCostAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "DailyProductionOutput" ADD COLUMN "processCostAmount" REAL NOT NULL DEFAULT 0;
