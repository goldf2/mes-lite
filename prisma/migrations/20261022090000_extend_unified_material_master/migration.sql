-- Extend the existing material authority; existing Material IDs and execution references stay intact.
ALTER TABLE "Material" ADD COLUMN "materialKind" TEXT NOT NULL DEFAULT 'GENERAL' CHECK("materialKind" IN ('GENERAL','PART'));
ALTER TABLE "Material" ADD COLUMN "defaultSourceMode" TEXT CHECK("defaultSourceMode" IS NULL OR "defaultSourceMode" IN ('MAKE','BUY','SUBCONTRACT'));
ALTER TABLE "Material" ADD COLUMN "drawingNo" TEXT;
ALTER TABLE "Material" ADD COLUMN "currentMaterial" TEXT;
ALTER TABLE "Material" ADD COLUMN "materialJis" TEXT;
ALTER TABLE "Material" ADD COLUMN "materialGb" TEXT;
ALTER TABLE "Material" ADD COLUMN "drawingSize" TEXT;
ALTER TABLE "Material" ADD COLUMN "feedCategory" TEXT;
ALTER TABLE "Material" ADD COLUMN "feedSpec" TEXT;
ALTER TABLE "Material" ADD COLUMN "feedMethod" TEXT;
ALTER TABLE "Material" ADD COLUMN "heatTreatmentProcess" TEXT;
ALTER TABLE "Material" ADD COLUMN "heatTreatment" BOOLEAN CHECK("heatTreatment" IS NULL OR "heatTreatment" IN (0,1));
ALTER TABLE "Material" ADD COLUMN "heatTreatmentConfirmed" BOOLEAN CHECK("heatTreatmentConfirmed" IS NULL OR "heatTreatmentConfirmed" IN (0,1));
ALTER TABLE "Material" ADD COLUMN "machiningProcess" TEXT;
ALTER TABLE "Material" ADD COLUMN "grossWeightText" TEXT;
-- Dimensions are nullable millimetres. Source zero is preserved, not interpreted as verified geometry.
ALTER TABLE "Material" ADD COLUMN "finishedLength" REAL CHECK("finishedLength" IS NULL OR ("finishedLength">=0 AND "finishedLength"<=1.7976931348623157e308));
ALTER TABLE "Material" ADD COLUMN "blankLength" REAL CHECK("blankLength" IS NULL OR ("blankLength">=0 AND "blankLength"<=1.7976931348623157e308));
ALTER TABLE "Material" ADD COLUMN "finishedWidth" REAL CHECK("finishedWidth" IS NULL OR ("finishedWidth">=0 AND "finishedWidth"<=1.7976931348623157e308));
ALTER TABLE "Material" ADD COLUMN "blankWidth" REAL CHECK("blankWidth" IS NULL OR ("blankWidth">=0 AND "blankWidth"<=1.7976931348623157e308));
ALTER TABLE "Material" ADD COLUMN "finishedThickness" REAL CHECK("finishedThickness" IS NULL OR ("finishedThickness">=0 AND "finishedThickness"<=1.7976931348623157e308));
ALTER TABLE "Material" ADD COLUMN "blankThickness" REAL CHECK("blankThickness" IS NULL OR ("blankThickness">=0 AND "blankThickness"<=1.7976931348623157e308));
ALTER TABLE "Material" ADD COLUMN "finishedInnerDiameter" REAL CHECK("finishedInnerDiameter" IS NULL OR ("finishedInnerDiameter">=0 AND "finishedInnerDiameter"<=1.7976931348623157e308));
ALTER TABLE "Material" ADD COLUMN "blankInnerDiameter" REAL CHECK("blankInnerDiameter" IS NULL OR ("blankInnerDiameter">=0 AND "blankInnerDiameter"<=1.7976931348623157e308));
ALTER TABLE "Material" ADD COLUMN "finishedOuterDiameter" REAL CHECK("finishedOuterDiameter" IS NULL OR ("finishedOuterDiameter">=0 AND "finishedOuterDiameter"<=1.7976931348623157e308));
ALTER TABLE "Material" ADD COLUMN "blankOuterDiameter" REAL CHECK("blankOuterDiameter" IS NULL OR ("blankOuterDiameter">=0 AND "blankOuterDiameter"<=1.7976931348623157e308));
ALTER TABLE "Material" ADD COLUMN "finishedHeight" REAL CHECK("finishedHeight" IS NULL OR ("finishedHeight">=0 AND "finishedHeight"<=1.7976931348623157e308));
ALTER TABLE "Material" ADD COLUMN "blankHeight" REAL CHECK("blankHeight" IS NULL OR ("blankHeight">=0 AND "blankHeight"<=1.7976931348623157e308));

CREATE TABLE "MaterialPurpose" (
  "materialId" TEXT NOT NULL,
  "purposeCode" TEXT NOT NULL CHECK("purposeCode" IN ('OWN_EQUIPMENT','OWN_PRODUCT','EXTERNAL_PROCESSING','OTHER')),
  PRIMARY KEY ("materialId", "purposeCode"),
  CONSTRAINT "MaterialPurpose_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MaterialModelUsage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "materialId" TEXT NOT NULL,
  "modelCode" TEXT NOT NULL CHECK(length(trim("modelCode"))>0),
  "assemblyName" TEXT NOT NULL DEFAULT '',
  "quantityPerMachine" REAL CHECK("quantityPerMachine" IS NULL OR ("quantityPerMachine">=0 AND "quantityPerMachine"<=1.7976931348623157e308)),
  CONSTRAINT "MaterialModelUsage_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Material_drawingNo_idx" ON "Material"("drawingNo");
CREATE INDEX "Material_materialKind_idx" ON "Material"("materialKind");
CREATE INDEX "MaterialPurpose_purposeCode_idx" ON "MaterialPurpose"("purposeCode");
CREATE UNIQUE INDEX "MaterialModelUsage_materialId_modelCode_assemblyName_key" ON "MaterialModelUsage"("materialId", "modelCode", "assemblyName");
CREATE INDEX "MaterialModelUsage_modelCode_idx" ON "MaterialModelUsage"("modelCode");
