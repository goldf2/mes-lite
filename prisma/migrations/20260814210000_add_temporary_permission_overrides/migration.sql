ALTER TABLE "OperatorPermissionOverride" ADD COLUMN "reason" TEXT;
ALTER TABLE "OperatorPermissionOverride" ADD COLUMN "grantedBy" TEXT;
ALTER TABLE "OperatorPermissionOverride" ADD COLUMN "startsAt" DATETIME;
ALTER TABLE "OperatorPermissionOverride" ADD COLUMN "expiresAt" DATETIME;
ALTER TABLE "OperatorPermissionOverride" ADD COLUMN "legacyPermanent" BOOLEAN NOT NULL DEFAULT false;

-- Existing overrides keep their previous behavior until an administrator
-- explicitly replaces or removes them. New writes must be time-bounded.
UPDATE "OperatorPermissionOverride"
SET "reason" = '历史个人覆盖兼容（需重新审批）',
    "grantedBy" = '__MIGRATION__',
    "startsAt" = "createdAt",
    "legacyPermanent" = true;

CREATE INDEX "OperatorPermissionOverride_expiresAt_idx" ON "OperatorPermissionOverride"("expiresAt");
