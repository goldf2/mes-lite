-- Preserve the operator-entered order of measured length rows.
ALTER TABLE "MaterialInProfileLine" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
