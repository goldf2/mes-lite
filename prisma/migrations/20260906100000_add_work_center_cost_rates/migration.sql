-- 工作中心默认费率：新建成本运行时用于补齐未单独覆盖的工序费率。
ALTER TABLE "WorkCenter" ADD COLUMN "laborRatePerHour" REAL NOT NULL DEFAULT 0;
ALTER TABLE "WorkCenter" ADD COLUMN "machineRatePerHour" REAL NOT NULL DEFAULT 0;
ALTER TABLE "WorkCenter" ADD COLUMN "energyCostPerHour" REAL NOT NULL DEFAULT 0;
