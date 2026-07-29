ALTER TABLE "CuttingTask" ADD COLUMN "remnantStockQty" REAL NOT NULL DEFAULT 0;
ALTER TABLE "CuttingTask" ADD COLUMN "remnantValuationQty" REAL NOT NULL DEFAULT 0;
ALTER TABLE "CuttingTask" ADD COLUMN "remnantCostAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "CuttingTaskSource" ADD COLUMN "remnantStockLogId" TEXT;
