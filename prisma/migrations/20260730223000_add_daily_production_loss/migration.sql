ALTER TABLE "DailyProductionConsumption" ADD COLUMN "lossMode" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "DailyProductionConsumption" ADD COLUMN "lossValue" REAL NOT NULL DEFAULT 0;
ALTER TABLE "DailyProductionConsumption" ADD COLUMN "lossQty" REAL NOT NULL DEFAULT 0;
