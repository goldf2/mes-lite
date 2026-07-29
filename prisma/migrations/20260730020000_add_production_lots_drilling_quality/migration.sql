CREATE TABLE "ProductionLot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "lotNo" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "cuttingTaskId" TEXT NOT NULL,
  "cuttingDemandId" TEXT NOT NULL,
  "productionOrderId" TEXT NOT NULL,
  "outputMaterialId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'WAITING_QC',
  "requiresDrilling" BOOLEAN NOT NULL DEFAULT false,
  "processSnapshot" TEXT,
  "drillingSpecSnapshot" TEXT,
  "cutGoodQty" INTEGER NOT NULL,
  "pendingDrillingQty" INTEGER NOT NULL DEFAULT 0,
  "pendingQcQty" INTEGER NOT NULL DEFAULT 0,
  "reworkQty" INTEGER NOT NULL DEFAULT 0,
  "passedQty" INTEGER NOT NULL DEFAULT 0,
  "scrappedQty" INTEGER NOT NULL DEFAULT 0,
  "stockedQty" INTEGER NOT NULL DEFAULT 0,
  "materialCostAmount" REAL NOT NULL DEFAULT 0,
  "unitMaterialCost" REAL NOT NULL DEFAULT 0,
  "stockedCostAmount" REAL NOT NULL DEFAULT 0,
  "reversedAt" DATETIME,
  "reversedBy" TEXT,
  "reverseReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ProductionLot_cuttingTaskId_fkey"
    FOREIGN KEY ("cuttingTaskId") REFERENCES "CuttingTask" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductionLot_cuttingDemandId_fkey"
    FOREIGN KEY ("cuttingDemandId") REFERENCES "CuttingDemand" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductionLot_productionOrderId_fkey"
    FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductionLot_outputMaterialId_fkey"
    FOREIGN KEY ("outputMaterialId") REFERENCES "Material" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProductionLot_lotNo_key" ON "ProductionLot"("lotNo");
CREATE UNIQUE INDEX "ProductionLot_sourceKey_key" ON "ProductionLot"("sourceKey");
CREATE INDEX "ProductionLot_productionOrderId_status_idx" ON "ProductionLot"("productionOrderId", "status");
CREATE INDEX "ProductionLot_outputMaterialId_status_idx" ON "ProductionLot"("outputMaterialId", "status");
CREATE INDEX "ProductionLot_cuttingTaskId_idx" ON "ProductionLot"("cuttingTaskId");
CREATE INDEX "ProductionLot_cuttingDemandId_idx" ON "ProductionLot"("cuttingDemandId");

CREATE TABLE "DrillingReport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reportNo" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "productionLotId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "operationType" TEXT NOT NULL DEFAULT 'INITIAL',
  "sourceBucket" TEXT NOT NULL,
  "inputQty" INTEGER NOT NULL,
  "goodQty" INTEGER NOT NULL,
  "reworkQty" INTEGER NOT NULL DEFAULT 0,
  "scrapQty" INTEGER NOT NULL DEFAULT 0,
  "holeType" TEXT,
  "drawingNo" TEXT,
  "note" TEXT,
  "operatorId" TEXT,
  "operatorName" TEXT,
  "startedAt" DATETIME,
  "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedAt" DATETIME,
  "reversedBy" TEXT,
  "reversedById" TEXT,
  "reverseReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DrillingReport_productionLotId_fkey"
    FOREIGN KEY ("productionLotId") REFERENCES "ProductionLot" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DrillingReport_reportNo_key" ON "DrillingReport"("reportNo");
CREATE UNIQUE INDEX "DrillingReport_clientRequestId_key" ON "DrillingReport"("clientRequestId");
CREATE INDEX "DrillingReport_productionLotId_createdAt_idx" ON "DrillingReport"("productionLotId", "createdAt");
CREATE INDEX "DrillingReport_status_idx" ON "DrillingReport"("status");

CREATE TABLE "QualityInspection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "inspectionNo" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "productionLotId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "inspectionType" TEXT NOT NULL DEFAULT 'INITIAL',
  "sourceBucket" TEXT NOT NULL,
  "inputQty" INTEGER NOT NULL,
  "sampleQty" INTEGER NOT NULL,
  "passedQty" INTEGER NOT NULL,
  "reworkQty" INTEGER NOT NULL DEFAULT 0,
  "scrapQty" INTEGER NOT NULL DEFAULT 0,
  "result" TEXT NOT NULL,
  "badReason" TEXT,
  "note" TEXT,
  "inspectorId" TEXT,
  "inspectorName" TEXT NOT NULL,
  "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedAt" DATETIME,
  "reversedBy" TEXT,
  "reversedById" TEXT,
  "reverseReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityInspection_productionLotId_fkey"
    FOREIGN KEY ("productionLotId") REFERENCES "ProductionLot" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "QualityInspection_inspectionNo_key" ON "QualityInspection"("inspectionNo");
CREATE UNIQUE INDEX "QualityInspection_clientRequestId_key" ON "QualityInspection"("clientRequestId");
CREATE INDEX "QualityInspection_productionLotId_checkedAt_idx" ON "QualityInspection"("productionLotId", "checkedAt");
CREATE INDEX "QualityInspection_status_idx" ON "QualityInspection"("status");

ALTER TABLE "StockIn" ADD COLUMN "productionLotId" TEXT
  REFERENCES "ProductionLot" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockIn" ADD COLUMN "materialId" TEXT
  REFERENCES "Material" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockIn" ADD COLUMN "clientRequestId" TEXT;
ALTER TABLE "StockIn" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'CONFIRMED';
ALTER TABLE "StockIn" ADD COLUMN "valuationQty" REAL NOT NULL DEFAULT 0;
ALTER TABLE "StockIn" ADD COLUMN "costAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "StockIn" ADD COLUMN "stockLogId" TEXT;
ALTER TABLE "StockIn" ADD COLUMN "reversedAt" DATETIME;
ALTER TABLE "StockIn" ADD COLUMN "reversedBy" TEXT;
ALTER TABLE "StockIn" ADD COLUMN "reverseReason" TEXT;
CREATE UNIQUE INDEX "StockIn_clientRequestId_key" ON "StockIn"("clientRequestId");
CREATE INDEX "StockIn_productionLotId_status_idx" ON "StockIn"("productionLotId", "status");
CREATE INDEX "StockIn_materialId_idx" ON "StockIn"("materialId");

INSERT OR IGNORE INTO "PermissionSetting"
  ("id", "role", "resource", "canRead", "canCreate", "canUpdate", "canDelete", "canGrant", "updatedAt")
VALUES
  ('production-lots-operator', 'OPERATOR', 'productionLots', true, true, true, false, false, CURRENT_TIMESTAMP),
  ('production-lots-auditor', 'AUDITOR', 'productionLots', true, true, true, false, false, CURRENT_TIMESTAMP),
  ('production-lots-admin', 'ADMIN', 'productionLots', true, true, true, true, true, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "PermissionGroupSetting"
  ("id", "groupId", "resource", "canRead", "canCreate", "canUpdate", "canDelete", "canGrant", "updatedAt")
SELECT
  'production-lots-group-' || "code",
  "id",
  'productionLots',
  true,
  true,
  true,
  false,
  CASE WHEN "code" = 'system_admin' THEN true ELSE false END,
  CURRENT_TIMESTAMP
FROM "PermissionGroup"
WHERE "code" IN ('basic_entry', 'business_audit', 'system_admin');
