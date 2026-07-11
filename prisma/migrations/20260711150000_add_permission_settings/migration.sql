CREATE TABLE "PermissionSetting" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "role" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "canRead" BOOLEAN NOT NULL DEFAULT false,
  "canCreate" BOOLEAN NOT NULL DEFAULT false,
  "canUpdate" BOOLEAN NOT NULL DEFAULT false,
  "canDelete" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "PermissionSetting_role_resource_key" ON "PermissionSetting"("role", "resource");
CREATE INDEX "PermissionSetting_role_idx" ON "PermissionSetting"("role");

