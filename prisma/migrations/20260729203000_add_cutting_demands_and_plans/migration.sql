-- Cutting-demand snapshots and manual nesting plans.
-- Existing Stock remains the quantity/cost ledger; confirmed cutting plans
-- reserve only ProfileStockEntity availability.

ALTER TABLE "BOMItem" ADD COLUMN "cutLengthMm" REAL;
ALTER TABLE "BOMItem" ADD COLUMN "cutTolerancePlusMm" REAL;
ALTER TABLE "BOMItem" ADD COLUMN "cutToleranceMinusMm" REAL;

ALTER TABLE "ProductionOrder" ADD COLUMN "dueDate" DATETIME;
ALTER TABLE "ProductionOrder" ADD COLUMN "bomVersionSnapshot" TEXT;
ALTER TABLE "ProductionOrder" ADD COLUMN "bomSnapshot" TEXT;
ALTER TABLE "ProductionOrder" ADD COLUMN "processSnapshot" TEXT;
ALTER TABLE "ProductionOrder" ADD COLUMN "snapshotCreatedAt" DATETIME;

CREATE TABLE "CuttingDemand" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "demandNo" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "productionOrderId" TEXT NOT NULL,
  "outputMaterialId" TEXT,
  "rawMaterialId" TEXT NOT NULL,
  "bomIdSnapshot" TEXT,
  "bomItemIdSnapshot" TEXT,
  "bomVersionSnapshot" TEXT,
  "outputCodeSnapshot" TEXT NOT NULL,
  "outputNameSnapshot" TEXT NOT NULL,
  "rawMaterialCodeSnapshot" TEXT NOT NULL,
  "rawMaterialNameSnapshot" TEXT NOT NULL,
  "rawMaterialSpecSnapshot" TEXT,
  "pieceLengthMm" REAL NOT NULL,
  "requiredQty" INTEGER NOT NULL,
  "plannedQty" INTEGER NOT NULL DEFAULT 0,
  "completedQty" INTEGER NOT NULL DEFAULT 0,
  "unit" TEXT NOT NULL DEFAULT '件',
  "kerfMm" REAL NOT NULL DEFAULT 0,
  "headTrimMm" REAL NOT NULL DEFAULT 0,
  "tailTrimMm" REAL NOT NULL DEFAULT 0,
  "clampDeadZoneMm" REAL NOT NULL DEFAULT 0,
  "tolerancePlusMm" REAL NOT NULL DEFAULT 0,
  "toleranceMinusMm" REAL NOT NULL DEFAULT 0,
  "dueDate" DATETIME,
  "configSnapshot" TEXT,
  "ruleWarnings" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CuttingDemand_productionOrderId_fkey"
    FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CuttingDemand_outputMaterialId_fkey"
    FOREIGN KEY ("outputMaterialId") REFERENCES "Material" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CuttingDemand_rawMaterialId_fkey"
    FOREIGN KEY ("rawMaterialId") REFERENCES "Material" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CuttingDemand_demandNo_key" ON "CuttingDemand"("demandNo");
CREATE UNIQUE INDEX "CuttingDemand_sourceKey_key" ON "CuttingDemand"("sourceKey");
CREATE INDEX "CuttingDemand_productionOrderId_idx" ON "CuttingDemand"("productionOrderId");
CREATE INDEX "CuttingDemand_rawMaterialId_status_dueDate_idx"
  ON "CuttingDemand"("rawMaterialId", "status", "dueDate");

CREATE TABLE "CuttingPlan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "planNo" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "allowMixedOrdersSnapshot" BOOLEAN NOT NULL DEFAULT false,
  "kerfMm" REAL NOT NULL DEFAULT 0,
  "headTrimMm" REAL NOT NULL DEFAULT 0,
  "tailTrimMm" REAL NOT NULL DEFAULT 0,
  "clampDeadZoneMm" REAL NOT NULL DEFAULT 0,
  "totalPlannedQty" INTEGER NOT NULL DEFAULT 0,
  "totalSourceQty" INTEGER NOT NULL DEFAULT 0,
  "totalSourceLengthMm" REAL NOT NULL DEFAULT 0,
  "totalProductLengthMm" REAL NOT NULL DEFAULT 0,
  "totalKerfLossMm" REAL NOT NULL DEFAULT 0,
  "totalFixedLossMm" REAL NOT NULL DEFAULT 0,
  "totalExpectedRemnantMm" REAL NOT NULL DEFAULT 0,
  "utilizationRate" REAL NOT NULL DEFAULT 0,
  "calculationSnapshot" TEXT NOT NULL,
  "confirmedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedBy" TEXT,
  "confirmedById" TEXT,
  "cancelledAt" DATETIME,
  "cancelledBy" TEXT,
  "cancelReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "CuttingPlan_planNo_key" ON "CuttingPlan"("planNo");
CREATE UNIQUE INDEX "CuttingPlan_clientRequestId_key" ON "CuttingPlan"("clientRequestId");
CREATE INDEX "CuttingPlan_status_confirmedAt_idx" ON "CuttingPlan"("status", "confirmedAt");

CREATE TABLE "CuttingPlanDemand" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "planId" TEXT NOT NULL,
  "demandId" TEXT NOT NULL,
  "requestedQty" INTEGER NOT NULL,
  "plannedQty" INTEGER NOT NULL,
  CONSTRAINT "CuttingPlanDemand_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "CuttingPlan" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CuttingPlanDemand_demandId_fkey"
    FOREIGN KEY ("demandId") REFERENCES "CuttingDemand" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CuttingPlanDemand_planId_demandId_key"
  ON "CuttingPlanDemand"("planId", "demandId");
CREATE INDEX "CuttingPlanDemand_demandId_idx" ON "CuttingPlanDemand"("demandId");

CREATE TABLE "CuttingPlanSource" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "planId" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "sourceUnitIndex" INTEGER NOT NULL,
  "sourceLengthMm" REAL NOT NULL,
  "plannedCutQty" INTEGER NOT NULL,
  "productLengthMm" REAL NOT NULL,
  "kerfLossMm" REAL NOT NULL,
  "fixedLossMm" REAL NOT NULL,
  "expectedRemnantLengthMm" REAL NOT NULL,
  "utilizationRate" REAL NOT NULL,
  CONSTRAINT "CuttingPlanSource_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "CuttingPlan" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CuttingPlanSource_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "ProfileStockEntity" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CuttingPlanSource_planId_entityId_sourceUnitIndex_key"
  ON "CuttingPlanSource"("planId", "entityId", "sourceUnitIndex");
CREATE INDEX "CuttingPlanSource_entityId_idx" ON "CuttingPlanSource"("entityId");

CREATE TABLE "CuttingPlanSourceCut" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceId" TEXT NOT NULL,
  "planDemandId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "pieceLengthMm" REAL NOT NULL,
  "plannedQty" INTEGER NOT NULL,
  "productLengthMm" REAL NOT NULL,
  "kerfLossMm" REAL NOT NULL,
  CONSTRAINT "CuttingPlanSourceCut_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "CuttingPlanSource" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CuttingPlanSourceCut_planDemandId_fkey"
    FOREIGN KEY ("planDemandId") REFERENCES "CuttingPlanDemand" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CuttingPlanSourceCut_sourceId_sequence_key"
  ON "CuttingPlanSourceCut"("sourceId", "sequence");
CREATE INDEX "CuttingPlanSourceCut_planDemandId_idx"
  ON "CuttingPlanSourceCut"("planDemandId");

INSERT OR IGNORE INTO "PermissionSetting"
  ("id", "role", "resource", "canRead", "canCreate", "canUpdate", "canDelete", "canGrant", "updatedAt")
VALUES
  ('cutting-plans-operator', 'OPERATOR', 'cuttingPlans', true, true, false, false, false, CURRENT_TIMESTAMP),
  ('cutting-plans-auditor', 'AUDITOR', 'cuttingPlans', true, true, true, false, false, CURRENT_TIMESTAMP),
  ('cutting-plans-admin', 'ADMIN', 'cuttingPlans', true, true, true, true, true, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "PermissionGroupSetting"
  ("id", "groupId", "resource", "canRead", "canCreate", "canUpdate", "canDelete", "canGrant", "updatedAt")
SELECT
  'cutting-plans-group-' || "code",
  "id",
  'cuttingPlans',
  true,
  true,
  CASE WHEN "code" IN ('business_audit', 'system_admin') THEN true ELSE false END,
  false,
  CASE WHEN "code" = 'system_admin' THEN true ELSE false END,
  CURRENT_TIMESTAMP
FROM "PermissionGroup"
WHERE "code" IN ('basic_entry', 'business_audit', 'system_admin');
