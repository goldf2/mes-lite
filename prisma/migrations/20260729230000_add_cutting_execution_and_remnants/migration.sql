-- Cutting execution, actual outputs, remnant lineage and reversible inventory
-- issue. Planning and execution remain separate facts.

ALTER TABLE "CuttingPlan" ADD COLUMN "rawMaterialId" TEXT
  REFERENCES "Material" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CuttingPlan" ADD COLUMN "reservedStockQty" REAL NOT NULL DEFAULT 0;
ALTER TABLE "CuttingPlan" ADD COLUMN "reservedValuationQty" REAL NOT NULL DEFAULT 0;
ALTER TABLE "CuttingPlan" ADD COLUMN "reservationStockLogId" TEXT;
ALTER TABLE "CuttingPlan" ADD COLUMN "releaseStockLogId" TEXT;
CREATE INDEX "CuttingPlan_rawMaterialId_idx" ON "CuttingPlan"("rawMaterialId");

ALTER TABLE "ProfileStockMovement" ADD COLUMN "beforeReservedQty" INTEGER;
ALTER TABLE "ProfileStockMovement" ADD COLUMN "afterReservedQty" INTEGER;
ALTER TABLE "ProfileStockMovement" ADD COLUMN "beforeConsumedQty" INTEGER;
ALTER TABLE "ProfileStockMovement" ADD COLUMN "afterConsumedQty" INTEGER;
ALTER TABLE "ProfileStockMovement" ADD COLUMN "beforeScrappedQty" INTEGER;
ALTER TABLE "ProfileStockMovement" ADD COLUMN "afterScrappedQty" INTEGER;

ALTER TABLE "StockLog" ADD COLUMN "beforeReservedQty" REAL;
ALTER TABLE "StockLog" ADD COLUMN "afterReservedQty" REAL;
ALTER TABLE "StockLog" ADD COLUMN "beforeAvailableQty" REAL;
ALTER TABLE "StockLog" ADD COLUMN "afterAvailableQty" REAL;
ALTER TABLE "StockLog" ADD COLUMN "beforeReservedValuationQty" REAL;
ALTER TABLE "StockLog" ADD COLUMN "afterReservedValuationQty" REAL;
ALTER TABLE "StockLog" ADD COLUMN "beforeAvailableValuationQty" REAL;
ALTER TABLE "StockLog" ADD COLUMN "afterAvailableValuationQty" REAL;

CREATE TABLE "CuttingTask" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "taskNo" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "cuttingPlanId" TEXT NOT NULL,
  "rawMaterialId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'READY',
  "device" TEXT,
  "shift" TEXT,
  "note" TEXT,
  "startedAt" DATETIME,
  "startedBy" TEXT,
  "startedById" TEXT,
  "completeRequestId" TEXT,
  "completedAt" DATETIME,
  "completedBy" TEXT,
  "completedById" TEXT,
  "issueStockQty" REAL NOT NULL DEFAULT 0,
  "issueValuationQty" REAL NOT NULL DEFAULT 0,
  "issueCostAmount" REAL NOT NULL DEFAULT 0,
  "issueConversionRate" REAL,
  "issueConversionSource" TEXT,
  "issueCostingMethod" TEXT,
  "stockIssueLogId" TEXT,
  "reversalStockLogId" TEXT,
  "reversedAt" DATETIME,
  "reversedBy" TEXT,
  "reversedById" TEXT,
  "reverseReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CuttingTask_cuttingPlanId_fkey"
    FOREIGN KEY ("cuttingPlanId") REFERENCES "CuttingPlan" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CuttingTask_rawMaterialId_fkey"
    FOREIGN KEY ("rawMaterialId") REFERENCES "Material" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CuttingTask_taskNo_key" ON "CuttingTask"("taskNo");
CREATE UNIQUE INDEX "CuttingTask_clientRequestId_key" ON "CuttingTask"("clientRequestId");
CREATE UNIQUE INDEX "CuttingTask_completeRequestId_key" ON "CuttingTask"("completeRequestId");
CREATE INDEX "CuttingTask_cuttingPlanId_status_idx" ON "CuttingTask"("cuttingPlanId", "status");
CREATE INDEX "CuttingTask_rawMaterialId_idx" ON "CuttingTask"("rawMaterialId");

CREATE TABLE "CuttingTaskSource" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "taskId" TEXT NOT NULL,
  "planSourceId" TEXT NOT NULL,
  "sourceEntityId" TEXT NOT NULL,
  "sourceUnitIndex" INTEGER NOT NULL,
  "actualSourceLengthMm" REAL NOT NULL,
  "actualRemainingLengthMm" REAL NOT NULL,
  "actualKerfLossMm" REAL NOT NULL,
  "actualFixedLossMm" REAL NOT NULL,
  "actualOtherLossMm" REAL NOT NULL,
  "disposition" TEXT NOT NULL,
  "remnantEntityId" TEXT,
  CONSTRAINT "CuttingTaskSource_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "CuttingTask" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CuttingTaskSource_planSourceId_fkey"
    FOREIGN KEY ("planSourceId") REFERENCES "CuttingPlanSource" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CuttingTaskSource_sourceEntityId_fkey"
    FOREIGN KEY ("sourceEntityId") REFERENCES "ProfileStockEntity" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CuttingTaskSource_remnantEntityId_fkey"
    FOREIGN KEY ("remnantEntityId") REFERENCES "ProfileStockEntity" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CuttingTaskSource_remnantEntityId_key" ON "CuttingTaskSource"("remnantEntityId");
CREATE UNIQUE INDEX "CuttingTaskSource_taskId_planSourceId_key" ON "CuttingTaskSource"("taskId", "planSourceId");
CREATE INDEX "CuttingTaskSource_sourceEntityId_idx" ON "CuttingTaskSource"("sourceEntityId");

CREATE TABLE "CuttingTaskOutput" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "taskSourceId" TEXT NOT NULL,
  "cuttingDemandId" TEXT NOT NULL,
  "plannedQty" INTEGER NOT NULL,
  "pieceLengthMm" REAL NOT NULL,
  "goodQty" INTEGER NOT NULL DEFAULT 0,
  "badQty" INTEGER NOT NULL DEFAULT 0,
  "scrapQty" INTEGER NOT NULL DEFAULT 0,
  "badReason" TEXT,
  CONSTRAINT "CuttingTaskOutput_taskSourceId_fkey"
    FOREIGN KEY ("taskSourceId") REFERENCES "CuttingTaskSource" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CuttingTaskOutput_cuttingDemandId_fkey"
    FOREIGN KEY ("cuttingDemandId") REFERENCES "CuttingDemand" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CuttingTaskOutput_taskSourceId_cuttingDemandId_key"
  ON "CuttingTaskOutput"("taskSourceId", "cuttingDemandId");
CREATE INDEX "CuttingTaskOutput_cuttingDemandId_idx" ON "CuttingTaskOutput"("cuttingDemandId");

CREATE TABLE "CuttingTaskCostLayerConsumption" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "taskId" TEXT NOT NULL,
  "costLayerId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "stockQty" REAL NOT NULL,
  "valuationQty" REAL NOT NULL,
  "costAmount" REAL NOT NULL,
  "stockUnitCost" REAL NOT NULL,
  "valuationUnitCost" REAL NOT NULL,
  "restoredAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CuttingTaskCostLayerConsumption_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "CuttingTask" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CuttingTaskCostLayerConsumption_costLayerId_fkey"
    FOREIGN KEY ("costLayerId") REFERENCES "InventoryCostLayer" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "CuttingTaskCostLayerConsumption_taskId_idx"
  ON "CuttingTaskCostLayerConsumption"("taskId");
CREATE INDEX "CuttingTaskCostLayerConsumption_costLayerId_idx"
  ON "CuttingTaskCostLayerConsumption"("costLayerId");
CREATE INDEX "CuttingTaskCostLayerConsumption_restoredAt_idx"
  ON "CuttingTaskCostLayerConsumption"("restoredAt");

INSERT OR IGNORE INTO "PermissionSetting"
  ("id", "role", "resource", "canRead", "canCreate", "canUpdate", "canDelete", "canGrant", "updatedAt")
VALUES
  ('cutting-tasks-operator', 'OPERATOR', 'cuttingTasks', true, true, true, false, false, CURRENT_TIMESTAMP),
  ('cutting-tasks-auditor', 'AUDITOR', 'cuttingTasks', true, true, true, false, false, CURRENT_TIMESTAMP),
  ('cutting-tasks-admin', 'ADMIN', 'cuttingTasks', true, true, true, true, true, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "PermissionGroupSetting"
  ("id", "groupId", "resource", "canRead", "canCreate", "canUpdate", "canDelete", "canGrant", "updatedAt")
SELECT
  'cutting-tasks-group-' || "code",
  "id",
  'cuttingTasks',
  true,
  true,
  true,
  false,
  CASE WHEN "code" = 'system_admin' THEN true ELSE false END,
  CURRENT_TIMESTAMP
FROM "PermissionGroup"
WHERE "code" IN ('basic_entry', 'business_audit', 'system_admin');
