-- CreateTable
CREATE TABLE "EquipmentInspectionPlan" (
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
    CONSTRAINT "EquipmentInspectionPlan_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "EquipmentInspectionPlanItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "standard" TEXT NOT NULL,
    "unit" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EquipmentInspectionPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "EquipmentInspectionPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "EquipmentInspectionRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recordNo" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "dueAt" DATETIME NOT NULL,
    "inspectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT NOT NULL,
    "inspectorId" TEXT,
    "inspectorName" TEXT NOT NULL,
    "note" TEXT,
    "faultEventId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EquipmentInspectionRecord_planId_fkey" FOREIGN KEY ("planId") REFERENCES "EquipmentInspectionPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EquipmentInspectionRecord_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EquipmentInspectionRecord_faultEventId_fkey" FOREIGN KEY ("faultEventId") REFERENCES "EquipmentEvent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "EquipmentInspectionResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recordId" TEXT NOT NULL,
    "planItemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "standard" TEXT NOT NULL,
    "unit" TEXT,
    "actualValue" TEXT,
    "result" TEXT NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EquipmentInspectionResult_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "EquipmentInspectionRecord" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EquipmentInspectionResult_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "EquipmentInspectionPlanItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentInspectionPlan_code_key" ON "EquipmentInspectionPlan"("code");
CREATE INDEX "EquipmentInspectionPlan_equipmentId_status_idx" ON "EquipmentInspectionPlan"("equipmentId", "status");
CREATE INDEX "EquipmentInspectionPlan_status_nextDueAt_idx" ON "EquipmentInspectionPlan"("status", "nextDueAt");
CREATE UNIQUE INDEX "EquipmentInspectionPlanItem_planId_sortOrder_key" ON "EquipmentInspectionPlanItem"("planId", "sortOrder");
CREATE INDEX "EquipmentInspectionPlanItem_planId_idx" ON "EquipmentInspectionPlanItem"("planId");
CREATE UNIQUE INDEX "EquipmentInspectionRecord_recordNo_key" ON "EquipmentInspectionRecord"("recordNo");
CREATE UNIQUE INDEX "EquipmentInspectionRecord_operationId_key" ON "EquipmentInspectionRecord"("operationId");
CREATE UNIQUE INDEX "EquipmentInspectionRecord_faultEventId_key" ON "EquipmentInspectionRecord"("faultEventId");
CREATE UNIQUE INDEX "EquipmentInspectionRecord_planId_dueAt_key" ON "EquipmentInspectionRecord"("planId", "dueAt");
CREATE INDEX "EquipmentInspectionRecord_equipmentId_inspectedAt_idx" ON "EquipmentInspectionRecord"("equipmentId", "inspectedAt");
CREATE INDEX "EquipmentInspectionRecord_result_inspectedAt_idx" ON "EquipmentInspectionRecord"("result", "inspectedAt");
CREATE UNIQUE INDEX "EquipmentInspectionResult_recordId_planItemId_key" ON "EquipmentInspectionResult"("recordId", "planItemId");
CREATE INDEX "EquipmentInspectionResult_recordId_sortOrder_idx" ON "EquipmentInspectionResult"("recordId", "sortOrder");

-- Domain invariants: only ACTIVE/PAUSED plans and PASS/ABNORMAL records are valid.
CREATE TRIGGER "EquipmentInspectionPlan_validate_insert"
BEFORE INSERT ON "EquipmentInspectionPlan"
WHEN trim(NEW."code") = '' OR trim(NEW."name") = '' OR trim(NEW."createdBy") = ''
  OR NEW."intervalDays" < 1 OR NEW."status" NOT IN ('ACTIVE', 'PAUSED')
BEGIN
    SELECT RAISE(ABORT, 'Invalid equipment inspection plan');
END;

CREATE TRIGGER "EquipmentInspectionPlan_restrict_update"
BEFORE UPDATE ON "EquipmentInspectionPlan"
WHEN NEW."id" IS NOT OLD."id"
  OR NEW."code" IS NOT OLD."code"
  OR NEW."name" IS NOT OLD."name"
  OR NEW."equipmentId" IS NOT OLD."equipmentId"
  OR NEW."intervalDays" IS NOT OLD."intervalDays"
  OR NEW."note" IS NOT OLD."note"
  OR NEW."createdBy" IS NOT OLD."createdBy"
  OR NEW."createdAt" IS NOT OLD."createdAt"
  OR NEW."status" NOT IN ('ACTIVE', 'PAUSED')
  OR (
      NEW."status" IS OLD."status"
      AND (
          NEW."activatedAt" IS NOT OLD."activatedAt"
          OR NEW."nextDueAt" <= OLD."nextDueAt"
          OR NOT EXISTS (
              SELECT 1 FROM "EquipmentInspectionRecord"
              WHERE "planId" = OLD."id" AND "dueAt" = OLD."nextDueAt"
          )
      )
  )
BEGIN
    SELECT RAISE(ABORT, 'Inspection plans allow only lifecycle or due-date updates');
END;

CREATE TRIGGER "EquipmentInspectionPlan_prevent_delete"
BEFORE DELETE ON "EquipmentInspectionPlan"
BEGIN
    SELECT RAISE(ABORT, 'Equipment inspection plans cannot be deleted');
END;

CREATE TRIGGER "EquipmentInspectionPlanItem_restrict_update"
BEFORE UPDATE ON "EquipmentInspectionPlanItem"
BEGIN
    SELECT RAISE(ABORT, 'Equipment inspection plan items are immutable');
END;

CREATE TRIGGER "EquipmentInspectionPlanItem_prevent_delete"
BEFORE DELETE ON "EquipmentInspectionPlanItem"
BEGIN
    SELECT RAISE(ABORT, 'Equipment inspection plan items cannot be deleted');
END;

CREATE TRIGGER "EquipmentInspectionRecord_validate_insert"
BEFORE INSERT ON "EquipmentInspectionRecord"
WHEN trim(NEW."recordNo") = '' OR trim(NEW."operationId") = '' OR trim(NEW."inspectorName") = ''
  OR NEW."result" NOT IN ('PASS', 'ABNORMAL')
  OR NOT EXISTS (SELECT 1 FROM "EquipmentInspectionPlan" WHERE "id" = NEW."planId" AND "equipmentId" = NEW."equipmentId")
  OR (NEW."result" = 'PASS' AND NEW."faultEventId" IS NOT NULL)
  OR (NEW."faultEventId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "EquipmentEvent" WHERE "id" = NEW."faultEventId" AND "equipmentId" = NEW."equipmentId" AND "eventType" = 'FAULT'
  ))
BEGIN
    SELECT RAISE(ABORT, 'Invalid equipment inspection record');
END;

CREATE TRIGGER "EquipmentInspectionRecord_restrict_update"
BEFORE UPDATE ON "EquipmentInspectionRecord"
BEGIN
    SELECT RAISE(ABORT, 'Equipment inspection records are immutable');
END;

CREATE TRIGGER "EquipmentInspectionRecord_prevent_delete"
BEFORE DELETE ON "EquipmentInspectionRecord"
BEGIN
    SELECT RAISE(ABORT, 'Equipment inspection records cannot be deleted');
END;

CREATE TRIGGER "EquipmentInspectionResult_validate_insert"
BEFORE INSERT ON "EquipmentInspectionResult"
WHEN trim(NEW."itemName") = '' OR trim(NEW."standard") = ''
  OR NEW."result" NOT IN ('PASS', 'FAIL')
  OR (NEW."result" = 'FAIL' AND trim(COALESCE(NEW."note", '')) = '')
  OR (NEW."result" = 'FAIL' AND NOT EXISTS (
      SELECT 1 FROM "EquipmentInspectionRecord" WHERE "id" = NEW."recordId" AND "result" = 'ABNORMAL'
  ))
  OR NOT EXISTS (
      SELECT 1 FROM "EquipmentInspectionRecord" R
      JOIN "EquipmentInspectionPlanItem" I ON I."id" = NEW."planItemId"
      WHERE R."id" = NEW."recordId" AND I."planId" = R."planId"
  )
BEGIN
    SELECT RAISE(ABORT, 'Invalid equipment inspection result');
END;

CREATE TRIGGER "EquipmentInspectionResult_validate_record_completion"
AFTER INSERT ON "EquipmentInspectionResult"
WHEN (
    SELECT COUNT(*) FROM "EquipmentInspectionResult" WHERE "recordId" = NEW."recordId"
) = (
    SELECT COUNT(*) FROM "EquipmentInspectionPlanItem" I
    JOIN "EquipmentInspectionRecord" R ON R."planId" = I."planId"
    WHERE R."id" = NEW."recordId"
)
AND (
    EXISTS (
        SELECT 1 FROM "EquipmentInspectionRecord" R
        WHERE R."id" = NEW."recordId" AND R."result" = 'PASS'
          AND EXISTS (SELECT 1 FROM "EquipmentInspectionResult" X WHERE X."recordId" = R."id" AND X."result" = 'FAIL')
    )
    OR EXISTS (
        SELECT 1 FROM "EquipmentInspectionRecord" R
        WHERE R."id" = NEW."recordId" AND R."result" = 'ABNORMAL'
          AND NOT EXISTS (SELECT 1 FROM "EquipmentInspectionResult" X WHERE X."recordId" = R."id" AND X."result" = 'FAIL')
    )
)
BEGIN
    SELECT RAISE(ABORT, 'Inspection record result does not match item results');
END;

CREATE TRIGGER "EquipmentInspectionResult_restrict_update"
BEFORE UPDATE ON "EquipmentInspectionResult"
BEGIN
    SELECT RAISE(ABORT, 'Equipment inspection results are immutable');
END;

CREATE TRIGGER "EquipmentInspectionResult_prevent_delete"
BEFORE DELETE ON "EquipmentInspectionResult"
BEGIN
    SELECT RAISE(ABORT, 'Equipment inspection results cannot be deleted');
END;
