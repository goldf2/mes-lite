ALTER TABLE "BOM" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'PRODUCTION';

CREATE INDEX "BOM_purpose_isActive_isDefault_idx" ON "BOM"("purpose", "isActive", "isDefault");
