CREATE TABLE "OperatorPermissionOverride" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "operatorId" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "canRead" BOOLEAN NOT NULL DEFAULT false,
  "canCreate" BOOLEAN NOT NULL DEFAULT false,
  "canUpdate" BOOLEAN NOT NULL DEFAULT false,
  "canDelete" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "OperatorPermissionOverride_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OperatorPermissionOverride_operatorId_resource_key" ON "OperatorPermissionOverride"("operatorId", "resource");
CREATE INDEX "OperatorPermissionOverride_operatorId_idx" ON "OperatorPermissionOverride"("operatorId");
