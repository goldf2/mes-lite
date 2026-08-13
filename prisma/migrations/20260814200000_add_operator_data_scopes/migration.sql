-- Stable production and inventory scope relations. Existing operators have no
-- row and therefore retain the legacy ALL/ALL behavior at the service layer.
CREATE TABLE "OperatorDataScope" (
    "operatorId" TEXT NOT NULL PRIMARY KEY,
    "productionMode" TEXT NOT NULL DEFAULT 'ALL',
    "inventoryMode" TEXT NOT NULL DEFAULT 'ALL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OperatorDataScope_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "OperatorWorkCenterScope" (
    "operatorId" TEXT NOT NULL,
    "workCenterId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("operatorId", "workCenterId"),
    CONSTRAINT "OperatorWorkCenterScope_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "OperatorDataScope" ("operatorId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OperatorWorkCenterScope_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "OperatorInventoryLocationScope" (
    "operatorId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("operatorId", "locationId"),
    CONSTRAINT "OperatorInventoryLocationScope_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "OperatorDataScope" ("operatorId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OperatorInventoryLocationScope_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "ProcessStep" ADD COLUMN "workCenterId" TEXT REFERENCES "WorkCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Dispatch" ADD COLUMN "employeeId" TEXT REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "OperatorWorkCenterScope_workCenterId_idx" ON "OperatorWorkCenterScope"("workCenterId");
CREATE INDEX "OperatorInventoryLocationScope_locationId_idx" ON "OperatorInventoryLocationScope"("locationId");
CREATE INDEX "ProcessStep_workCenterId_idx" ON "ProcessStep"("workCenterId");
CREATE INDEX "Dispatch_employeeId_idx" ON "Dispatch"("employeeId");

-- Only deterministic unique matches are backfilled. Ambiguous historical text
-- remains a snapshot and must be mapped by an administrator before narrowing.
UPDATE "ProcessStep"
SET "workCenterId" = (
  SELECT "WorkCenter"."id"
  FROM "WorkCenter"
  WHERE "WorkCenter"."deletedAt" IS NULL
    AND ("WorkCenter"."code" = "ProcessStep"."workstation" OR "WorkCenter"."name" = "ProcessStep"."workstation")
  LIMIT 1
)
WHERE "workstation" IS NOT NULL
  AND (
    SELECT COUNT(*)
    FROM "WorkCenter"
    WHERE "WorkCenter"."deletedAt" IS NULL
      AND ("WorkCenter"."code" = "ProcessStep"."workstation" OR "WorkCenter"."name" = "ProcessStep"."workstation")
  ) = 1;

UPDATE "Dispatch"
SET "employeeId" = (
  SELECT "Employee"."id"
  FROM "Employee"
  WHERE "Employee"."code" = "Dispatch"."workerId"
  LIMIT 1
)
WHERE "workerId" IS NOT NULL;
