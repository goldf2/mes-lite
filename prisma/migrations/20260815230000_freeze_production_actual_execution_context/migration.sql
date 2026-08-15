ALTER TABLE "ProductionOrderActual" ADD COLUMN "equipmentExceptionReason" TEXT;
ALTER TABLE "ProductionOrderActual" ADD COLUMN "workInstructionExceptionReason" TEXT;

CREATE TABLE "ProductionOrderActualEquipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actualId" TEXT NOT NULL,
    "sourceEquipmentId" TEXT,
    "equipmentCode" TEXT NOT NULL,
    "equipmentName" TEXT NOT NULL,
    "equipmentType" TEXT NOT NULL,
    "equipmentModel" TEXT,
    "equipmentStatus" TEXT NOT NULL,
    "workCenterId" TEXT NOT NULL,
    "workCenterCode" TEXT NOT NULL,
    "workCenterName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionOrderActualEquipment_actualId_fkey" FOREIGN KEY ("actualId") REFERENCES "ProductionOrderActual" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrderActualEquipment_sourceEquipmentId_fkey" FOREIGN KEY ("sourceEquipmentId") REFERENCES "Equipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ProductionOrderActualWorkInstruction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actualId" TEXT NOT NULL,
    "sourceWorkInstructionId" TEXT,
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "materialId" TEXT,
    "materialCode" TEXT,
    "materialName" TEXT,
    "workCentersJson" TEXT NOT NULL DEFAULT '[]',
    "contentJson" TEXT,
    "contentText" TEXT,
    "attachmentsJson" TEXT NOT NULL DEFAULT '[]',
    "sourceUpdatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionOrderActualWorkInstruction_actualId_fkey" FOREIGN KEY ("actualId") REFERENCES "ProductionOrderActual" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrderActualWorkInstruction_sourceWorkInstructionId_fkey" FOREIGN KEY ("sourceWorkInstructionId") REFERENCES "WorkInstruction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ProductionOrderActualEquipment_sourceEquipmentId_idx" ON "ProductionOrderActualEquipment"("sourceEquipmentId");
CREATE INDEX "ProductionOrderActualEquipment_workCenterId_idx" ON "ProductionOrderActualEquipment"("workCenterId");
CREATE UNIQUE INDEX "ProductionOrderActualEquipment_actualId_sourceEquipmentId_key" ON "ProductionOrderActualEquipment"("actualId", "sourceEquipmentId");
CREATE INDEX "ProductionOrderActualWorkInstruction_sourceWorkInstructionId_idx" ON "ProductionOrderActualWorkInstruction"("sourceWorkInstructionId");
CREATE INDEX "ProductionOrderActualWorkInstruction_materialId_idx" ON "ProductionOrderActualWorkInstruction"("materialId");
CREATE UNIQUE INDEX "ProductionOrderActualWorkInstruction_actualId_sourceWorkInstructionId_key" ON "ProductionOrderActualWorkInstruction"("actualId", "sourceWorkInstructionId");

-- Existing rows predate execution-context capture. Preserve their confirmability
-- without inventing equipment or document master-data references.
UPDATE "ProductionOrderActual"
SET "equipmentExceptionReason" = '历史实绩迁移：原系统未记录实际设备',
    "workInstructionExceptionReason" = '历史实绩迁移：原系统未记录作业文件版本';

CREATE TRIGGER "ProductionOrderActual_context_reason_validate_insert"
BEFORE INSERT ON "ProductionOrderActual"
FOR EACH ROW
WHEN (NEW."equipmentExceptionReason" IS NOT NULL AND (length(trim(NEW."equipmentExceptionReason")) < 2 OR length(trim(NEW."equipmentExceptionReason")) > 200))
  OR (NEW."workInstructionExceptionReason" IS NOT NULL AND (length(trim(NEW."workInstructionExceptionReason")) < 2 OR length(trim(NEW."workInstructionExceptionReason")) > 200))
BEGIN
  SELECT RAISE(ABORT, 'production actual context reason must be 2-200 characters');
END;

CREATE TRIGGER "ProductionOrderActual_context_reason_validate_update"
BEFORE UPDATE OF "equipmentExceptionReason", "workInstructionExceptionReason" ON "ProductionOrderActual"
FOR EACH ROW
WHEN (NEW."equipmentExceptionReason" IS NOT NULL AND (length(trim(NEW."equipmentExceptionReason")) < 2 OR length(trim(NEW."equipmentExceptionReason")) > 200))
  OR (NEW."workInstructionExceptionReason" IS NOT NULL AND (length(trim(NEW."workInstructionExceptionReason")) < 2 OR length(trim(NEW."workInstructionExceptionReason")) > 200))
BEGIN
  SELECT RAISE(ABORT, 'production actual context reason must be 2-200 characters');
END;

CREATE TRIGGER "ProductionOrderActual_context_required_on_insert"
BEFORE INSERT ON "ProductionOrderActual"
FOR EACH ROW
WHEN NEW."status" IN ('CONFIRMED', 'REVERSED')
BEGIN
  SELECT CASE WHEN length(trim(coalesce(NEW."equipmentExceptionReason", ''))) < 2
    THEN RAISE(ABORT, 'production actual equipment context required') END;
  SELECT CASE WHEN length(trim(coalesce(NEW."workInstructionExceptionReason", ''))) < 2
    THEN RAISE(ABORT, 'production actual work instruction context required') END;
END;

CREATE TRIGGER "ProductionOrderActual_context_required_on_confirm"
BEFORE UPDATE OF "status" ON "ProductionOrderActual"
FOR EACH ROW
WHEN NEW."status" = 'CONFIRMED' AND OLD."status" <> 'CONFIRMED'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
      SELECT 1 FROM "ProductionOrderActualEquipment" WHERE "actualId" = OLD."id"
    ) AND length(trim(coalesce(NEW."equipmentExceptionReason", ''))) < 2
    THEN RAISE(ABORT, 'production actual equipment context required') END;
  SELECT CASE WHEN NOT EXISTS (
      SELECT 1 FROM "ProductionOrderActualWorkInstruction" WHERE "actualId" = OLD."id"
    ) AND length(trim(coalesce(NEW."workInstructionExceptionReason", ''))) < 2
    THEN RAISE(ABORT, 'production actual work instruction context required') END;
END;

CREATE TRIGGER "ProductionOrderActual_context_reason_immutable"
BEFORE UPDATE OF "equipmentExceptionReason", "workInstructionExceptionReason" ON "ProductionOrderActual"
FOR EACH ROW
WHEN OLD."status" <> 'DRAFT'
  AND (NEW."equipmentExceptionReason" IS NOT OLD."equipmentExceptionReason"
    OR NEW."workInstructionExceptionReason" IS NOT OLD."workInstructionExceptionReason")
BEGIN
  SELECT RAISE(ABORT, 'confirmed production actual context is immutable');
END;

CREATE TRIGGER "ProductionOrderActualEquipment_restrict_insert"
BEFORE INSERT ON "ProductionOrderActualEquipment"
FOR EACH ROW
WHEN coalesce((SELECT "status" FROM "ProductionOrderActual" WHERE "id" = NEW."actualId"), 'DRAFT') <> 'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'confirmed production actual context is immutable');
END;

CREATE TRIGGER "ProductionOrderActualEquipment_restrict_update"
BEFORE UPDATE ON "ProductionOrderActualEquipment"
FOR EACH ROW
WHEN coalesce((SELECT "status" FROM "ProductionOrderActual" WHERE "id" = OLD."actualId"), 'DRAFT') <> 'DRAFT'
  OR coalesce((SELECT "status" FROM "ProductionOrderActual" WHERE "id" = NEW."actualId"), 'DRAFT') <> 'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'confirmed production actual context is immutable');
END;

CREATE TRIGGER "ProductionOrderActualEquipment_restrict_delete"
BEFORE DELETE ON "ProductionOrderActualEquipment"
FOR EACH ROW
WHEN coalesce((SELECT "status" FROM "ProductionOrderActual" WHERE "id" = OLD."actualId"), 'DRAFT') <> 'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'confirmed production actual context is immutable');
END;

CREATE TRIGGER "ProductionOrderActualWorkInstruction_restrict_insert"
BEFORE INSERT ON "ProductionOrderActualWorkInstruction"
FOR EACH ROW
WHEN coalesce((SELECT "status" FROM "ProductionOrderActual" WHERE "id" = NEW."actualId"), 'DRAFT') <> 'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'confirmed production actual context is immutable');
END;

CREATE TRIGGER "ProductionOrderActualWorkInstruction_restrict_update"
BEFORE UPDATE ON "ProductionOrderActualWorkInstruction"
FOR EACH ROW
WHEN coalesce((SELECT "status" FROM "ProductionOrderActual" WHERE "id" = OLD."actualId"), 'DRAFT') <> 'DRAFT'
  OR coalesce((SELECT "status" FROM "ProductionOrderActual" WHERE "id" = NEW."actualId"), 'DRAFT') <> 'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'confirmed production actual context is immutable');
END;

CREATE TRIGGER "ProductionOrderActualWorkInstruction_restrict_delete"
BEFORE DELETE ON "ProductionOrderActualWorkInstruction"
FOR EACH ROW
WHEN coalesce((SELECT "status" FROM "ProductionOrderActual" WHERE "id" = OLD."actualId"), 'DRAFT') <> 'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'confirmed production actual context is immutable');
END;
