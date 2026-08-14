CREATE TABLE "QualityInspectionStandard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "samplingMode" TEXT NOT NULL,
    "sampleValue" REAL NOT NULL DEFAULT 0,
    "minSampleQty" REAL,
    "maxSampleQty" REAL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "changeReason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "releasedAt" DATETIME,
    "releasedBy" TEXT,
    "obsoleteAt" DATETIME,
    "obsoleteBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QualityInspectionStandard_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "QualityInspectionStandardItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "standardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "acceptanceCriteria" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityInspectionStandardItem_standardId_fkey" FOREIGN KEY ("standardId") REFERENCES "QualityInspectionStandard" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "QualityInspection" ADD COLUMN "standardId" TEXT REFERENCES "QualityInspectionStandard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityInspection" ADD COLUMN "standardCodeSnapshot" TEXT;
ALTER TABLE "QualityInspection" ADD COLUMN "standardVersionSnapshot" INTEGER;
ALTER TABLE "QualityInspection" ADD COLUMN "standardNameSnapshot" TEXT;
ALTER TABLE "QualityInspection" ADD COLUMN "samplingModeSnapshot" TEXT;
ALTER TABLE "QualityInspection" ADD COLUMN "samplingValueSnapshot" REAL;
ALTER TABLE "QualityInspection" ADD COLUMN "minSampleQtySnapshot" REAL;
ALTER TABLE "QualityInspection" ADD COLUMN "maxSampleQtySnapshot" REAL;
ALTER TABLE "QualityInspection" ADD COLUMN "suggestedSampleQty" REAL NOT NULL DEFAULT 0;

CREATE TABLE "QualityInspectionCheckItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inspectionId" TEXT NOT NULL,
    "standardItemId" TEXT,
    "name" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "acceptanceCriteria" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "measuredValue" TEXT,
    "note" TEXT,
    "checkedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityInspectionCheckItem_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "QualityInspection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityInspectionCheckItem_standardItemId_fkey" FOREIGN KEY ("standardItemId") REFERENCES "QualityInspectionStandardItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "QualityInspectionStandard_code_version_key" ON "QualityInspectionStandard"("code", "version");
CREATE INDEX "QualityInspectionStandard_materialId_sourceType_status_idx" ON "QualityInspectionStandard"("materialId", "sourceType", "status");
CREATE INDEX "QualityInspectionStandard_status_updatedAt_idx" ON "QualityInspectionStandard"("status", "updatedAt");
CREATE UNIQUE INDEX "QualityInspectionStandard_active_material_source_key" ON "QualityInspectionStandard"("materialId", "sourceType") WHERE "status" = 'RELEASED';
CREATE UNIQUE INDEX "QualityInspectionStandardItem_standardId_sortOrder_key" ON "QualityInspectionStandardItem"("standardId", "sortOrder");
CREATE INDEX "QualityInspectionStandardItem_standardId_idx" ON "QualityInspectionStandardItem"("standardId");
CREATE INDEX "QualityInspection_standardId_status_idx" ON "QualityInspection"("standardId", "status");
CREATE UNIQUE INDEX "QualityInspectionCheckItem_inspectionId_sortOrder_key" ON "QualityInspectionCheckItem"("inspectionId", "sortOrder");
CREATE INDEX "QualityInspectionCheckItem_inspectionId_result_idx" ON "QualityInspectionCheckItem"("inspectionId", "result");
CREATE INDEX "QualityInspectionCheckItem_standardItemId_idx" ON "QualityInspectionCheckItem"("standardItemId");
CREATE INDEX "QualityInspectionCheckItem_name_result_idx" ON "QualityInspectionCheckItem"("name", "result");

CREATE TRIGGER "QualityInspectionStandard_validate_insert"
BEFORE INSERT ON "QualityInspectionStandard"
WHEN trim(NEW."code") = '' OR trim(NEW."name") = '' OR trim(NEW."changeReason") = '' OR trim(NEW."createdBy") = ''
  OR NEW."version" < 1 OR NEW."status" <> 'DRAFT'
  OR NEW."sourceType" NOT IN ('PRODUCTION_ORDER_ACTUAL_OUTPUT', 'RETURN_ORDER')
  OR NEW."samplingMode" NOT IN ('FULL', 'FIXED', 'PERCENTAGE')
  OR (NEW."samplingMode" = 'FULL' AND NEW."sampleValue" <> 0)
  OR (NEW."samplingMode" = 'FIXED' AND NEW."sampleValue" <= 0)
  OR (NEW."samplingMode" = 'PERCENTAGE' AND (NEW."sampleValue" <= 0 OR NEW."sampleValue" > 100))
  OR NEW."minSampleQty" < 0 OR NEW."maxSampleQty" <= 0
  OR (NEW."minSampleQty" IS NOT NULL AND NEW."maxSampleQty" IS NOT NULL AND NEW."minSampleQty" > NEW."maxSampleQty")
  OR NOT EXISTS (SELECT 1 FROM "Material" WHERE "id" = NEW."materialId" AND "deletedAt" IS NULL)
BEGIN SELECT RAISE(ABORT, 'Invalid quality inspection standard'); END;

CREATE TRIGGER "QualityInspectionStandard_validate_update"
BEFORE UPDATE ON "QualityInspectionStandard"
WHEN NEW."id" IS NOT OLD."id" OR NEW."code" IS NOT OLD."code" OR NEW."version" IS NOT OLD."version"
  OR NEW."materialId" IS NOT OLD."materialId" OR NEW."sourceType" IS NOT OLD."sourceType" OR NEW."createdBy" IS NOT OLD."createdBy" OR NEW."createdAt" IS NOT OLD."createdAt"
  OR (OLD."status" <> 'DRAFT' AND (
    NEW."name" IS NOT OLD."name" OR NEW."samplingMode" IS NOT OLD."samplingMode" OR NEW."sampleValue" IS NOT OLD."sampleValue"
    OR NEW."minSampleQty" IS NOT OLD."minSampleQty" OR NEW."maxSampleQty" IS NOT OLD."maxSampleQty" OR NEW."changeReason" IS NOT OLD."changeReason"
  ))
  OR NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" = 'DRAFT' AND NEW."releasedAt" IS NULL AND NEW."releasedBy" IS NULL AND NEW."obsoleteAt" IS NULL AND NEW."obsoleteBy" IS NULL)
    OR (OLD."status" = 'DRAFT' AND NEW."status" = 'RELEASED' AND NEW."releasedAt" IS NOT NULL AND trim(coalesce(NEW."releasedBy", '')) <> '' AND NEW."obsoleteAt" IS NULL AND NEW."obsoleteBy" IS NULL AND EXISTS (SELECT 1 FROM "QualityInspectionStandardItem" WHERE "standardId" = OLD."id"))
    OR (OLD."status" = 'RELEASED' AND NEW."status" = 'OBSOLETE' AND NEW."releasedAt" IS OLD."releasedAt" AND NEW."releasedBy" IS OLD."releasedBy" AND NEW."obsoleteAt" IS NOT NULL AND trim(coalesce(NEW."obsoleteBy", '')) <> '')
  )
BEGIN SELECT RAISE(ABORT, 'Released quality inspection standards are immutable'); END;

CREATE TRIGGER "QualityInspectionStandard_prevent_delete"
BEFORE DELETE ON "QualityInspectionStandard" BEGIN SELECT RAISE(ABORT, 'Quality inspection standards cannot be deleted'); END;

CREATE TRIGGER "QualityInspectionStandardItem_validate_insert"
BEFORE INSERT ON "QualityInspectionStandardItem"
WHEN trim(NEW."name") = '' OR trim(NEW."method") = '' OR trim(NEW."acceptanceCriteria") = '' OR NEW."sortOrder" < 1
  OR NOT EXISTS (SELECT 1 FROM "QualityInspectionStandard" WHERE "id" = NEW."standardId" AND "status" = 'DRAFT')
BEGIN SELECT RAISE(ABORT, 'Invalid quality inspection standard item'); END;

CREATE TRIGGER "QualityInspectionStandardItem_validate_update"
BEFORE UPDATE ON "QualityInspectionStandardItem"
WHEN NOT EXISTS (SELECT 1 FROM "QualityInspectionStandard" WHERE "id" = OLD."standardId" AND "status" = 'DRAFT')
  OR NEW."id" IS NOT OLD."id" OR NEW."standardId" IS NOT OLD."standardId" OR NEW."createdAt" IS NOT OLD."createdAt"
BEGIN SELECT RAISE(ABORT, 'Released quality inspection standard items are immutable'); END;

CREATE TRIGGER "QualityInspectionStandardItem_validate_delete"
BEFORE DELETE ON "QualityInspectionStandardItem"
WHEN NOT EXISTS (SELECT 1 FROM "QualityInspectionStandard" WHERE "id" = OLD."standardId" AND "status" = 'DRAFT')
BEGIN SELECT RAISE(ABORT, 'Released quality inspection standard items cannot be deleted'); END;

CREATE TRIGGER "QualityInspection_snapshot_immutable"
BEFORE UPDATE ON "QualityInspection"
WHEN NEW."standardId" IS NOT OLD."standardId" OR NEW."standardCodeSnapshot" IS NOT OLD."standardCodeSnapshot"
  OR NEW."standardVersionSnapshot" IS NOT OLD."standardVersionSnapshot" OR NEW."standardNameSnapshot" IS NOT OLD."standardNameSnapshot"
  OR NEW."samplingModeSnapshot" IS NOT OLD."samplingModeSnapshot" OR NEW."samplingValueSnapshot" IS NOT OLD."samplingValueSnapshot"
  OR NEW."minSampleQtySnapshot" IS NOT OLD."minSampleQtySnapshot" OR NEW."maxSampleQtySnapshot" IS NOT OLD."maxSampleQtySnapshot"
  OR NEW."suggestedSampleQty" IS NOT OLD."suggestedSampleQty"
BEGIN SELECT RAISE(ABORT, 'Quality inspection standard snapshots are immutable'); END;

CREATE TRIGGER "QualityInspection_completion_requires_items"
BEFORE UPDATE OF "status", "result" ON "QualityInspection"
WHEN OLD."status" = 'PENDING' AND NEW."status" = 'COMPLETED'
  AND EXISTS (SELECT 1 FROM "QualityInspectionCheckItem" WHERE "inspectionId" = OLD."id")
  AND (
    EXISTS (SELECT 1 FROM "QualityInspectionCheckItem" WHERE "inspectionId" = OLD."id" AND "result" = 'PENDING')
    OR (NEW."result" = 'PASS' AND EXISTS (SELECT 1 FROM "QualityInspectionCheckItem" WHERE "inspectionId" = OLD."id" AND "result" <> 'PASS'))
    OR (NEW."result" IN ('FAIL', 'PARTIAL') AND NOT EXISTS (SELECT 1 FROM "QualityInspectionCheckItem" WHERE "inspectionId" = OLD."id" AND "result" = 'FAIL'))
  )
BEGIN SELECT RAISE(ABORT, 'Quality inspection completion does not match check item results'); END;

CREATE TRIGGER "QualityInspectionCheckItem_validate_insert"
BEFORE INSERT ON "QualityInspectionCheckItem"
WHEN trim(NEW."name") = '' OR trim(NEW."method") = '' OR trim(NEW."acceptanceCriteria") = '' OR NEW."sortOrder" < 1 OR NEW."result" <> 'PENDING'
  OR NOT EXISTS (SELECT 1 FROM "QualityInspection" WHERE "id" = NEW."inspectionId" AND "status" = 'PENDING')
BEGIN SELECT RAISE(ABORT, 'Invalid quality inspection check item'); END;

CREATE TRIGGER "QualityInspectionCheckItem_validate_update"
BEFORE UPDATE ON "QualityInspectionCheckItem"
WHEN NEW."id" IS NOT OLD."id" OR NEW."inspectionId" IS NOT OLD."inspectionId" OR NEW."standardItemId" IS NOT OLD."standardItemId"
  OR NEW."name" IS NOT OLD."name" OR NEW."method" IS NOT OLD."method" OR NEW."acceptanceCriteria" IS NOT OLD."acceptanceCriteria"
  OR NEW."sortOrder" IS NOT OLD."sortOrder" OR NEW."createdAt" IS NOT OLD."createdAt"
  OR OLD."result" <> 'PENDING' OR NEW."result" NOT IN ('PASS', 'FAIL') OR NEW."checkedAt" IS NULL
  OR NOT EXISTS (SELECT 1 FROM "QualityInspection" WHERE "id" = OLD."inspectionId" AND "status" = 'PENDING')
BEGIN SELECT RAISE(ABORT, 'Quality inspection check results are immutable'); END;

CREATE TRIGGER "QualityInspectionCheckItem_prevent_delete"
BEFORE DELETE ON "QualityInspectionCheckItem" BEGIN SELECT RAISE(ABORT, 'Quality inspection check items cannot be deleted'); END;
