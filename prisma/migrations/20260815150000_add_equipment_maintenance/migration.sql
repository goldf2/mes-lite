CREATE TABLE "EquipmentMaintenancePlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "intervalDays" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "nextDueAt" DATETIME NOT NULL,
    "activatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EquipmentMaintenancePlan_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "EquipmentMaintenancePlanItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "standard" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EquipmentMaintenancePlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "EquipmentMaintenancePlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "EquipmentMaintenanceWorkOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workOrderNo" TEXT NOT NULL,
    "createOperationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "planId" TEXT,
    "planDueAt" DATETIME,
    "dueAt" DATETIME,
    "title" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "faultDescription" TEXT,
    "assignedTo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "startedAt" DATETIME,
    "startedById" TEXT,
    "startedByName" TEXT,
    "completedAt" DATETIME,
    "completedById" TEXT,
    "completedByName" TEXT,
    "completionOperationId" TEXT,
    "cancelledAt" DATETIME,
    "cancelledById" TEXT,
    "cancelledByName" TEXT,
    "cancelReason" TEXT,
    "workDescription" TEXT,
    "failureCause" TEXT,
    "faultEventId" TEXT,
    "startEventId" TEXT,
    "recoveryEventId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EquipmentMaintenanceWorkOrder_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EquipmentMaintenanceWorkOrder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "EquipmentMaintenancePlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EquipmentMaintenanceWorkOrder_faultEventId_fkey" FOREIGN KEY ("faultEventId") REFERENCES "EquipmentEvent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EquipmentMaintenanceWorkOrder_startEventId_fkey" FOREIGN KEY ("startEventId") REFERENCES "EquipmentEvent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EquipmentMaintenanceWorkOrder_recoveryEventId_fkey" FOREIGN KEY ("recoveryEventId") REFERENCES "EquipmentEvent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "EquipmentMaintenanceWorkResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workOrderId" TEXT NOT NULL,
    "planItemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "standard" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EquipmentMaintenanceWorkResult_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "EquipmentMaintenanceWorkOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EquipmentMaintenanceWorkResult_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "EquipmentMaintenancePlanItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "EquipmentMaintenanceSpareUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workOrderId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "stockQty" REAL NOT NULL,
    "valuationQty" REAL NOT NULL DEFAULT 0,
    "costAmount" REAL NOT NULL DEFAULT 0,
    "stockUnitSnapshot" TEXT NOT NULL,
    "valuationUnitSnapshot" TEXT NOT NULL,
    "conversionRateUsed" REAL NOT NULL DEFAULT 0,
    "costingMethodSnapshot" TEXT NOT NULL,
    "stockLogId" TEXT NOT NULL,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EquipmentMaintenanceSpareUsage_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "EquipmentMaintenanceWorkOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EquipmentMaintenanceSpareUsage_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EquipmentMaintenanceSpareUsage_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "EquipmentMaintenanceSpareLotAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spareUsageId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "inventoryStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "stockQty" REAL NOT NULL,
    "valuationQty" REAL NOT NULL DEFAULT 0,
    "costAmount" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EquipmentMaintenanceSpareLotAllocation_spareUsageId_fkey" FOREIGN KEY ("spareUsageId") REFERENCES "EquipmentMaintenanceSpareUsage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EquipmentMaintenanceSpareLotAllocation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EquipmentMaintenanceSpareLotAllocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EquipmentMaintenancePlan_code_key" ON "EquipmentMaintenancePlan"("code");
CREATE INDEX "EquipmentMaintenancePlan_equipmentId_status_idx" ON "EquipmentMaintenancePlan"("equipmentId", "status");
CREATE INDEX "EquipmentMaintenancePlan_status_nextDueAt_idx" ON "EquipmentMaintenancePlan"("status", "nextDueAt");
CREATE INDEX "EquipmentMaintenancePlanItem_planId_idx" ON "EquipmentMaintenancePlanItem"("planId");
CREATE UNIQUE INDEX "EquipmentMaintenancePlanItem_planId_sortOrder_key" ON "EquipmentMaintenancePlanItem"("planId", "sortOrder");
CREATE UNIQUE INDEX "EquipmentMaintenanceWorkOrder_workOrderNo_key" ON "EquipmentMaintenanceWorkOrder"("workOrderNo");
CREATE UNIQUE INDEX "EquipmentMaintenanceWorkOrder_createOperationId_key" ON "EquipmentMaintenanceWorkOrder"("createOperationId");
CREATE UNIQUE INDEX "EquipmentMaintenanceWorkOrder_completionOperationId_key" ON "EquipmentMaintenanceWorkOrder"("completionOperationId");
CREATE UNIQUE INDEX "EquipmentMaintenanceWorkOrder_faultEventId_key" ON "EquipmentMaintenanceWorkOrder"("faultEventId");
CREATE UNIQUE INDEX "EquipmentMaintenanceWorkOrder_startEventId_key" ON "EquipmentMaintenanceWorkOrder"("startEventId");
CREATE UNIQUE INDEX "EquipmentMaintenanceWorkOrder_recoveryEventId_key" ON "EquipmentMaintenanceWorkOrder"("recoveryEventId");
CREATE INDEX "EquipmentMaintenanceWorkOrder_equipmentId_status_idx" ON "EquipmentMaintenanceWorkOrder"("equipmentId", "status");
CREATE INDEX "EquipmentMaintenanceWorkOrder_status_dueAt_idx" ON "EquipmentMaintenanceWorkOrder"("status", "dueAt");
CREATE INDEX "EquipmentMaintenanceWorkOrder_kind_status_idx" ON "EquipmentMaintenanceWorkOrder"("kind", "status");
CREATE UNIQUE INDEX "EquipmentMaintenanceWorkOrder_active_plan_due_key" ON "EquipmentMaintenanceWorkOrder"("planId", "planDueAt") WHERE "status" <> 'CANCELLED';
CREATE INDEX "EquipmentMaintenanceWorkResult_workOrderId_sortOrder_idx" ON "EquipmentMaintenanceWorkResult"("workOrderId", "sortOrder");
CREATE UNIQUE INDEX "EquipmentMaintenanceWorkResult_workOrderId_planItemId_key" ON "EquipmentMaintenanceWorkResult"("workOrderId", "planItemId");
CREATE UNIQUE INDEX "EquipmentMaintenanceSpareUsage_stockLogId_key" ON "EquipmentMaintenanceSpareUsage"("stockLogId");
CREATE INDEX "EquipmentMaintenanceSpareUsage_materialId_createdAt_idx" ON "EquipmentMaintenanceSpareUsage"("materialId", "createdAt");
CREATE INDEX "EquipmentMaintenanceSpareUsage_locationId_createdAt_idx" ON "EquipmentMaintenanceSpareUsage"("locationId", "createdAt");
CREATE UNIQUE INDEX "EquipmentMaintenanceSpareUsage_workOrderId_materialId_locationId_key" ON "EquipmentMaintenanceSpareUsage"("workOrderId", "materialId", "locationId");
CREATE INDEX "EquipmentMaintenanceSpareLotAllocation_lotId_idx" ON "EquipmentMaintenanceSpareLotAllocation"("lotId");
CREATE INDEX "EquipmentMaintenanceSpareLotAllocation_locationId_idx" ON "EquipmentMaintenanceSpareLotAllocation"("locationId");
CREATE UNIQUE INDEX "EquipmentMaintenanceSpareLotAllocation_spareUsageId_lotId_locationId_key" ON "EquipmentMaintenanceSpareLotAllocation"("spareUsageId", "lotId", "locationId");

CREATE TRIGGER "EquipmentMaintenancePlan_validate_insert"
BEFORE INSERT ON "EquipmentMaintenancePlan"
WHEN trim(NEW."code") = '' OR trim(NEW."name") = '' OR trim(NEW."createdBy") = ''
  OR NEW."intervalDays" < 1 OR NEW."status" <> 'ACTIVE'
  OR NOT EXISTS (SELECT 1 FROM "Equipment" WHERE "id" = NEW."equipmentId" AND "deletedAt" IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'Invalid equipment maintenance plan');
END;

CREATE TRIGGER "EquipmentMaintenancePlan_restrict_update"
BEFORE UPDATE ON "EquipmentMaintenancePlan"
WHEN NEW."id" IS NOT OLD."id" OR NEW."code" IS NOT OLD."code" OR NEW."name" IS NOT OLD."name"
  OR NEW."equipmentId" IS NOT OLD."equipmentId" OR NEW."intervalDays" IS NOT OLD."intervalDays"
  OR NEW."note" IS NOT OLD."note" OR NEW."createdBy" IS NOT OLD."createdBy" OR NEW."createdAt" IS NOT OLD."createdAt"
  OR NEW."status" NOT IN ('ACTIVE', 'PAUSED')
  OR (NEW."status" <> OLD."status" AND NOT (OLD."status" = 'ACTIVE' AND NEW."status" = 'PAUSED') AND NOT (OLD."status" = 'PAUSED' AND NEW."status" = 'ACTIVE'))
  OR (NEW."nextDueAt" <> OLD."nextDueAt" AND NEW."nextDueAt" <= OLD."nextDueAt")
  OR (NEW."nextDueAt" <> OLD."nextDueAt" AND OLD."status" = NEW."status" AND NOT EXISTS (
    SELECT 1 FROM "EquipmentMaintenanceWorkOrder"
    WHERE "planId" = OLD."id" AND "planDueAt" = OLD."nextDueAt" AND "status" = 'COMPLETED'
  ))
BEGIN
  SELECT RAISE(ABORT, 'Equipment maintenance plans are immutable except status and controlled due advancement');
END;

CREATE TRIGGER "EquipmentMaintenancePlan_prevent_delete"
BEFORE DELETE ON "EquipmentMaintenancePlan" BEGIN SELECT RAISE(ABORT, 'Equipment maintenance plans cannot be deleted'); END;

CREATE TRIGGER "EquipmentMaintenancePlanItem_validate_insert"
BEFORE INSERT ON "EquipmentMaintenancePlanItem"
WHEN trim(NEW."name") = '' OR trim(NEW."standard") = '' OR NEW."sortOrder" < 1
  OR NOT EXISTS (SELECT 1 FROM "EquipmentMaintenancePlan" WHERE "id" = NEW."planId")
BEGIN SELECT RAISE(ABORT, 'Invalid equipment maintenance plan item'); END;

CREATE TRIGGER "EquipmentMaintenancePlanItem_restrict_update"
BEFORE UPDATE ON "EquipmentMaintenancePlanItem" BEGIN SELECT RAISE(ABORT, 'Equipment maintenance plan items are immutable'); END;
CREATE TRIGGER "EquipmentMaintenancePlanItem_prevent_delete"
BEFORE DELETE ON "EquipmentMaintenancePlanItem" BEGIN SELECT RAISE(ABORT, 'Equipment maintenance plan items cannot be deleted'); END;

CREATE TRIGGER "EquipmentMaintenanceWorkOrder_validate_insert"
BEFORE INSERT ON "EquipmentMaintenanceWorkOrder"
WHEN trim(NEW."workOrderNo") = '' OR trim(NEW."createOperationId") = '' OR trim(NEW."title") = ''
  OR trim(NEW."createdByName") = '' OR NEW."status" <> 'OPEN'
  OR NEW."kind" NOT IN ('PREVENTIVE', 'CORRECTIVE') OR NEW."priority" NOT IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')
  OR NOT EXISTS (SELECT 1 FROM "Equipment" WHERE "id" = NEW."equipmentId" AND "deletedAt" IS NULL)
  OR (NEW."kind" = 'PREVENTIVE' AND (NEW."planId" IS NULL OR NEW."planDueAt" IS NULL OR NEW."dueAt" IS NULL
    OR NOT EXISTS (SELECT 1 FROM "EquipmentMaintenancePlan" WHERE "id" = NEW."planId" AND "equipmentId" = NEW."equipmentId" AND "status" = 'ACTIVE' AND "nextDueAt" = NEW."planDueAt")))
  OR (NEW."kind" = 'CORRECTIVE' AND (NEW."planId" IS NOT NULL OR NEW."planDueAt" IS NOT NULL OR trim(coalesce(NEW."faultDescription", '')) = ''))
BEGIN SELECT RAISE(ABORT, 'Invalid equipment maintenance work order'); END;

CREATE TRIGGER "EquipmentMaintenanceWorkOrder_validate_update"
BEFORE UPDATE ON "EquipmentMaintenanceWorkOrder"
WHEN NEW."id" IS NOT OLD."id" OR NEW."workOrderNo" IS NOT OLD."workOrderNo" OR NEW."createOperationId" IS NOT OLD."createOperationId"
  OR NEW."kind" IS NOT OLD."kind" OR NEW."equipmentId" IS NOT OLD."equipmentId" OR NEW."planId" IS NOT OLD."planId"
  OR NEW."planDueAt" IS NOT OLD."planDueAt" OR NEW."dueAt" IS NOT OLD."dueAt" OR NEW."title" IS NOT OLD."title"
  OR NEW."priority" IS NOT OLD."priority" OR NEW."faultDescription" IS NOT OLD."faultDescription" OR NEW."assignedTo" IS NOT OLD."assignedTo"
  OR NEW."createdById" IS NOT OLD."createdById" OR NEW."createdByName" IS NOT OLD."createdByName" OR NEW."createdAt" IS NOT OLD."createdAt"
  OR NOT (
    (OLD."status" = 'OPEN' AND NEW."status" = 'IN_PROGRESS' AND NEW."startedAt" IS NOT NULL AND trim(coalesce(NEW."startedByName", '')) <> '' AND NEW."startEventId" IS NOT NULL)
    OR (OLD."status" = 'OPEN' AND NEW."status" = 'CANCELLED' AND NEW."cancelledAt" IS NOT NULL AND trim(coalesce(NEW."cancelledByName", '')) <> '' AND trim(coalesce(NEW."cancelReason", '')) <> '')
    OR (OLD."status" = 'IN_PROGRESS' AND NEW."status" = 'COMPLETED' AND NEW."completedAt" IS NOT NULL AND trim(coalesce(NEW."completedByName", '')) <> '' AND trim(coalesce(NEW."completionOperationId", '')) <> '' AND trim(coalesce(NEW."workDescription", '')) <> '' AND NEW."recoveryEventId" IS NOT NULL
      AND (NEW."kind" = 'CORRECTIVE' OR (
        (SELECT count(*) FROM "EquipmentMaintenanceWorkResult" WHERE "workOrderId" = OLD."id") = (SELECT count(*) FROM "EquipmentMaintenancePlanItem" WHERE "planId" = OLD."planId")
        AND NOT EXISTS (SELECT 1 FROM "EquipmentMaintenanceWorkResult" WHERE "workOrderId" = OLD."id" AND "result" <> 'PASS')
      )))
  )
BEGIN SELECT RAISE(ABORT, 'Invalid equipment maintenance work order transition'); END;

CREATE TRIGGER "EquipmentMaintenanceWorkOrder_prevent_delete"
BEFORE DELETE ON "EquipmentMaintenanceWorkOrder" BEGIN SELECT RAISE(ABORT, 'Equipment maintenance work orders cannot be deleted'); END;

CREATE TRIGGER "EquipmentMaintenanceWorkResult_validate_insert"
BEFORE INSERT ON "EquipmentMaintenanceWorkResult"
WHEN trim(NEW."itemName") = '' OR trim(NEW."standard") = '' OR NEW."result" <> 'PASS' OR NEW."sortOrder" < 1
  OR NOT EXISTS (
    SELECT 1 FROM "EquipmentMaintenanceWorkOrder" wo
    JOIN "EquipmentMaintenancePlanItem" item ON item."planId" = wo."planId"
    WHERE wo."id" = NEW."workOrderId" AND wo."kind" = 'PREVENTIVE' AND wo."status" = 'IN_PROGRESS' AND item."id" = NEW."planItemId"
  )
BEGIN SELECT RAISE(ABORT, 'Invalid equipment maintenance work result'); END;
CREATE TRIGGER "EquipmentMaintenanceWorkResult_restrict_update"
BEFORE UPDATE ON "EquipmentMaintenanceWorkResult" BEGIN SELECT RAISE(ABORT, 'Equipment maintenance work results are immutable'); END;
CREATE TRIGGER "EquipmentMaintenanceWorkResult_prevent_delete"
BEFORE DELETE ON "EquipmentMaintenanceWorkResult" BEGIN SELECT RAISE(ABORT, 'Equipment maintenance work results cannot be deleted'); END;

CREATE TRIGGER "EquipmentMaintenanceSpareUsage_validate_insert"
BEFORE INSERT ON "EquipmentMaintenanceSpareUsage"
WHEN NEW."stockQty" <= 0 OR trim(NEW."stockUnitSnapshot") = '' OR trim(NEW."valuationUnitSnapshot") = ''
  OR trim(NEW."costingMethodSnapshot") = '' OR trim(NEW."stockLogId") = '' OR trim(NEW."createdBy") = ''
  OR NOT EXISTS (SELECT 1 FROM "EquipmentMaintenanceWorkOrder" WHERE "id" = NEW."workOrderId" AND "status" = 'IN_PROGRESS')
BEGIN SELECT RAISE(ABORT, 'Invalid equipment maintenance spare usage'); END;
CREATE TRIGGER "EquipmentMaintenanceSpareUsage_restrict_update"
BEFORE UPDATE ON "EquipmentMaintenanceSpareUsage" BEGIN SELECT RAISE(ABORT, 'Equipment maintenance spare usages are immutable'); END;
CREATE TRIGGER "EquipmentMaintenanceSpareUsage_prevent_delete"
BEFORE DELETE ON "EquipmentMaintenanceSpareUsage" BEGIN SELECT RAISE(ABORT, 'Equipment maintenance spare usages cannot be deleted'); END;

CREATE TRIGGER "EquipmentMaintenanceSpareLotAllocation_validate_insert"
BEFORE INSERT ON "EquipmentMaintenanceSpareLotAllocation"
WHEN NEW."stockQty" <= 0 OR NEW."inventoryStatus" <> 'AVAILABLE'
  OR NOT EXISTS (SELECT 1 FROM "EquipmentMaintenanceSpareUsage" WHERE "id" = NEW."spareUsageId" AND "locationId" = NEW."locationId")
BEGIN SELECT RAISE(ABORT, 'Invalid equipment maintenance spare lot allocation'); END;
CREATE TRIGGER "EquipmentMaintenanceSpareLotAllocation_restrict_update"
BEFORE UPDATE ON "EquipmentMaintenanceSpareLotAllocation" BEGIN SELECT RAISE(ABORT, 'Equipment maintenance spare lot allocations are immutable'); END;
CREATE TRIGGER "EquipmentMaintenanceSpareLotAllocation_prevent_delete"
BEFORE DELETE ON "EquipmentMaintenanceSpareLotAllocation" BEGIN SELECT RAISE(ABORT, 'Equipment maintenance spare lot allocations cannot be deleted'); END;

DROP TRIGGER "EquipmentEvent_validate_insert";
CREATE TRIGGER "EquipmentEvent_validate_insert"
BEFORE INSERT ON "EquipmentEvent"
WHEN trim(NEW."reason") = '' OR trim(NEW."operatorName") = ''
  OR NOT EXISTS (SELECT 1 FROM "Equipment" WHERE "id" = NEW."equipmentId" AND "deletedAt" IS NULL AND "status" = NEW."sourceStatus")
  OR NOT (
    (NEW."eventType" = 'START' AND NEW."sourceStatus" = 'AVAILABLE' AND NEW."targetStatus" = 'IN_USE')
    OR (NEW."eventType" = 'STOP' AND NEW."sourceStatus" IN ('AVAILABLE', 'IN_USE') AND NEW."targetStatus" = 'STOPPED')
    OR (NEW."eventType" = 'FAULT' AND NEW."sourceStatus" IN ('AVAILABLE', 'IN_USE') AND NEW."targetStatus" = 'FAULT')
    OR (NEW."eventType" = 'MAINTAIN' AND NEW."sourceStatus" IN ('AVAILABLE', 'IN_USE', 'STOPPED', 'FAULT') AND NEW."targetStatus" = 'MAINTENANCE')
    OR (NEW."eventType" = 'RECOVER' AND NEW."sourceStatus" IN ('STOPPED', 'FAULT', 'MAINTENANCE') AND NEW."targetStatus" = 'AVAILABLE')
    OR (NEW."eventType" = 'ARCHIVE' AND NEW."targetStatus" = 'STOPPED')
  )
BEGIN SELECT RAISE(ABORT, 'Invalid equipment event transition or inactive equipment'); END;
