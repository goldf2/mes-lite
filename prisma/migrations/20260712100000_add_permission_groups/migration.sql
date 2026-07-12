CREATE TABLE "PermissionGroup" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "PermissionGroupSetting" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupId" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "canRead" BOOLEAN NOT NULL DEFAULT false,
  "canCreate" BOOLEAN NOT NULL DEFAULT false,
  "canUpdate" BOOLEAN NOT NULL DEFAULT false,
  "canDelete" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PermissionGroupSetting_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PermissionGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "OperatorPermissionGroup" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "operatorId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperatorPermissionGroup_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OperatorPermissionGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PermissionGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PermissionGroup_code_key" ON "PermissionGroup"("code");
CREATE UNIQUE INDEX "PermissionGroupSetting_groupId_resource_key" ON "PermissionGroupSetting"("groupId", "resource");
CREATE INDEX "PermissionGroupSetting_groupId_idx" ON "PermissionGroupSetting"("groupId");
CREATE UNIQUE INDEX "OperatorPermissionGroup_operatorId_groupId_key" ON "OperatorPermissionGroup"("operatorId", "groupId");
CREATE INDEX "OperatorPermissionGroup_operatorId_idx" ON "OperatorPermissionGroup"("operatorId");
CREATE INDEX "OperatorPermissionGroup_groupId_idx" ON "OperatorPermissionGroup"("groupId");
