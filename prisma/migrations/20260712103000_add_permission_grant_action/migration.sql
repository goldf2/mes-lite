ALTER TABLE "PermissionSetting" ADD COLUMN "canGrant" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OperatorPermissionOverride" ADD COLUMN "canGrant" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PermissionGroupSetting" ADD COLUMN "canGrant" BOOLEAN NOT NULL DEFAULT false;

UPDATE "PermissionSetting" SET "canGrant" = true WHERE "role" = 'ADMIN';
UPDATE "PermissionGroupSetting"
SET "canGrant" = true
WHERE "groupId" IN (SELECT "id" FROM "PermissionGroup" WHERE "code" = 'system_admin');
