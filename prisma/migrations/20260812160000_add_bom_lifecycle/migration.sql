-- 已有有效 BOM 属于已经投入使用的数据，迁移为已发布；停用 BOM 迁移为已作废。
ALTER TABLE "BOM" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "BOM" ADD COLUMN "basedOnBomId" TEXT;
ALTER TABLE "BOM" ADD COLUMN "changeReason" TEXT;
ALTER TABLE "BOM" ADD COLUMN "releasedAt" DATETIME;
ALTER TABLE "BOM" ADD COLUMN "releasedBy" TEXT;
ALTER TABLE "BOM" ADD COLUMN "obsoleteAt" DATETIME;
ALTER TABLE "BOM" ADD COLUMN "obsoleteBy" TEXT;
ALTER TABLE "BOM" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00';

UPDATE "BOM"
SET
  "status" = CASE WHEN "isActive" = 1 THEN 'RELEASED' ELSE 'OBSOLETE' END,
  "releasedAt" = CASE WHEN "isActive" = 1 THEN "createdAt" ELSE NULL END,
  "releasedBy" = CASE WHEN "isActive" = 1 THEN 'SYSTEM_MIGRATION' ELSE NULL END,
  "obsoleteAt" = CASE WHEN "isActive" = 0 THEN "createdAt" ELSE NULL END,
  "obsoleteBy" = CASE WHEN "isActive" = 0 THEN 'SYSTEM_MIGRATION' ELSE NULL END,
  "updatedAt" = "createdAt";

CREATE INDEX "BOM_productId_status_purpose_idx" ON "BOM"("productId", "status", "purpose");
CREATE INDEX "BOM_basedOnBomId_idx" ON "BOM"("basedOnBomId");
