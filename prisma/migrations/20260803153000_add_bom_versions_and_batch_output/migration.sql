DROP INDEX "BOM_productId_key";

ALTER TABLE "BOM" ADD COLUMN "name" TEXT NOT NULL DEFAULT '默认方案';
ALTER TABLE "BOM" ADD COLUMN "bomType" TEXT NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "BOM" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX "BOM_productId_version_key" ON "BOM"("productId", "version");
CREATE INDEX "BOM_productId_isActive_isDefault_idx" ON "BOM"("productId", "isActive", "isDefault");
