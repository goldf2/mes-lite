CREATE TABLE "DailyProductionOutput" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reportId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "bomOutputId" TEXT,
  "materialCode" TEXT NOT NULL,
  "materialName" TEXT NOT NULL,
  "quantityPerBatch" REAL NOT NULL DEFAULT 0,
  "plannedQty" REAL NOT NULL DEFAULT 0,
  "actualQty" REAL NOT NULL,
  "unit" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "valuationQty" REAL NOT NULL DEFAULT 0,
  "costAmount" REAL NOT NULL DEFAULT 0,
  "stockUnit" TEXT,
  "valuationUnit" TEXT,
  "conversionRateUsed" REAL,
  "conversionSource" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyProductionOutput_reportId_fkey"
    FOREIGN KEY ("reportId") REFERENCES "DailyProductionReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DailyProductionOutput_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DailyProductionOutput_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "InventoryLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DailyProductionOutput_reportId_materialId_key"
  ON "DailyProductionOutput"("reportId", "materialId");
CREATE INDEX "DailyProductionOutput_reportId_idx" ON "DailyProductionOutput"("reportId");
CREATE INDEX "DailyProductionOutput_materialId_idx" ON "DailyProductionOutput"("materialId");
CREATE INDEX "DailyProductionOutput_locationId_idx" ON "DailyProductionOutput"("locationId");
