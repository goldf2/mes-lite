DROP TRIGGER "QualityInspectionStandard_validate_insert";

CREATE TRIGGER "QualityInspectionStandard_validate_insert"
BEFORE INSERT ON "QualityInspectionStandard"
WHEN trim(NEW."code") = '' OR trim(NEW."name") = '' OR trim(NEW."changeReason") = '' OR trim(NEW."createdBy") = ''
  OR NEW."version" < 1 OR NEW."status" <> 'DRAFT'
  OR NEW."sourceType" NOT IN ('PRODUCTION_ORDER_ACTUAL_OUTPUT', 'MATERIAL_IN', 'RETURN_ORDER')
  OR NEW."samplingMode" NOT IN ('FULL', 'FIXED', 'PERCENTAGE')
  OR (NEW."samplingMode" = 'FULL' AND NEW."sampleValue" <> 0)
  OR (NEW."samplingMode" = 'FIXED' AND NEW."sampleValue" <= 0)
  OR (NEW."samplingMode" = 'PERCENTAGE' AND (NEW."sampleValue" <= 0 OR NEW."sampleValue" > 100))
  OR NEW."minSampleQty" < 0 OR NEW."maxSampleQty" <= 0
  OR (NEW."minSampleQty" IS NOT NULL AND NEW."maxSampleQty" IS NOT NULL AND NEW."minSampleQty" > NEW."maxSampleQty")
  OR NOT EXISTS (SELECT 1 FROM "Material" WHERE "id" = NEW."materialId" AND "deletedAt" IS NULL)
BEGIN SELECT RAISE(ABORT, 'Invalid quality inspection standard'); END;

CREATE TRIGGER "QualityInspection_material_in_cancel_guard"
BEFORE UPDATE OF "status", "result" ON "QualityInspection"
WHEN NEW."status" = 'CANCELLED'
  AND (
    OLD."status" <> 'PENDING'
    OR OLD."sourceType" <> 'MATERIAL_IN'
    OR NEW."result" <> 'CANCELLED'
    OR trim(coalesce(NEW."inspector", '')) = ''
    OR NEW."checkedAt" IS NULL
  )
BEGIN SELECT RAISE(ABORT, 'Only pending material-in inspections can be cancelled'); END;

CREATE TRIGGER "QualityInspection_cancelled_immutable"
BEFORE UPDATE ON "QualityInspection"
WHEN OLD."status" = 'CANCELLED'
BEGIN SELECT RAISE(ABORT, 'Cancelled quality inspections are immutable'); END;
