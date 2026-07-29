-- Aluminum profile specifications, measured receipt lines, entity subledger,
-- and nullable manufacturing rules. Existing Stock/StockLog remain the
-- compatibility inventory and cost ledger.

ALTER TABLE "MaterialIn" ADD COLUMN "clientRequestId" TEXT;
CREATE UNIQUE INDEX "MaterialIn_clientRequestId_key" ON "MaterialIn"("clientRequestId");

CREATE TABLE "ProfileSpec" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "materialId" TEXT NOT NULL,
  "sectionDescription" TEXT,
  "alloyGrade" TEXT,
  "temper" TEXT,
  "surfaceTreatment" TEXT,
  "drawingNo" TEXT,
  "densityKgPerMeter" REAL,
  "trackingMode" TEXT NOT NULL DEFAULT 'BATCH',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ProfileSpec_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "Material" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProfileSpec_materialId_key" ON "ProfileSpec"("materialId");

CREATE TABLE "ManufacturingConfig" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
  "requireIndividualMeasurement" BOOLEAN,
  "allowMixedOrders" BOOLEAN,
  "kerfMm" REAL,
  "headTrimMm" REAL,
  "tailTrimMm" REAL,
  "clampDeadZoneMm" REAL,
  "minReusableRemnantLengthMm" REAL,
  "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "MaterialInProfileLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientLineId" TEXT,
  "materialInId" TEXT NOT NULL,
  "actualLengthMm" REAL NOT NULL,
  "quantity" INTEGER NOT NULL,
  "trackingMode" TEXT NOT NULL DEFAULT 'BATCH',
  "totalWeightKg" REAL,
  "location" TEXT,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaterialInProfileLine_materialInId_fkey"
    FOREIGN KEY ("materialInId") REFERENCES "MaterialIn" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MaterialInProfileLine_clientLineId_key" ON "MaterialInProfileLine"("clientLineId");
CREATE INDEX "MaterialInProfileLine_materialInId_idx" ON "MaterialInProfileLine"("materialInId");
CREATE INDEX "MaterialInProfileLine_actualLengthMm_idx" ON "MaterialInProfileLine"("actualLengthMm");

CREATE TABLE "ProfileStockEntity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityNo" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "materialInId" TEXT,
  "receiptLineId" TEXT,
  "supplierId" TEXT,
  "parentEntityId" TEXT,
  "entityType" TEXT NOT NULL DEFAULT 'BATCH',
  "actualLengthMm" REAL NOT NULL,
  "originalLengthMm" REAL NOT NULL,
  "quantity" INTEGER NOT NULL,
  "availableQty" INTEGER NOT NULL DEFAULT 0,
  "reservedQty" INTEGER NOT NULL DEFAULT 0,
  "consumedQty" INTEGER NOT NULL DEFAULT 0,
  "scrappedQty" INTEGER NOT NULL DEFAULT 0,
  "splitQty" INTEGER NOT NULL DEFAULT 0,
  "totalWeightKg" REAL,
  "unitWeightKg" REAL,
  "batchNo" TEXT,
  "location" TEXT,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "isRemnant" BOOLEAN NOT NULL DEFAULT false,
  "reusable" BOOLEAN NOT NULL DEFAULT true,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "receivedAt" DATETIME,
  "reversedAt" DATETIME,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ProfileStockEntity_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "Material" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProfileStockEntity_materialInId_fkey"
    FOREIGN KEY ("materialInId") REFERENCES "MaterialIn" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProfileStockEntity_receiptLineId_fkey"
    FOREIGN KEY ("receiptLineId") REFERENCES "MaterialInProfileLine" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProfileStockEntity_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProfileStockEntity_parentEntityId_fkey"
    FOREIGN KEY ("parentEntityId") REFERENCES "ProfileStockEntity" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProfileStockEntity_entityNo_key" ON "ProfileStockEntity"("entityNo");
CREATE INDEX "ProfileStockEntity_materialId_status_actualLengthMm_idx"
  ON "ProfileStockEntity"("materialId", "status", "actualLengthMm");
CREATE INDEX "ProfileStockEntity_materialInId_idx" ON "ProfileStockEntity"("materialInId");
CREATE INDEX "ProfileStockEntity_receiptLineId_idx" ON "ProfileStockEntity"("receiptLineId");
CREATE INDEX "ProfileStockEntity_supplierId_idx" ON "ProfileStockEntity"("supplierId");
CREATE INDEX "ProfileStockEntity_parentEntityId_idx" ON "ProfileStockEntity"("parentEntityId");
CREATE INDEX "ProfileStockEntity_sourceType_sourceId_idx" ON "ProfileStockEntity"("sourceType", "sourceId");

CREATE TABLE "ProfileStockMovement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "movementType" TEXT NOT NULL,
  "quantityDelta" INTEGER NOT NULL,
  "beforeAvailableQty" INTEGER NOT NULL,
  "afterAvailableQty" INTEGER NOT NULL,
  "beforeStatus" TEXT,
  "afterStatus" TEXT,
  "lengthBeforeMm" REAL,
  "lengthAfterMm" REAL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sourceMovementId" TEXT,
  "reversalMovementId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "operatorId" TEXT,
  "operatorName" TEXT,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfileStockMovement_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "ProfileStockEntity" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProfileStockMovement_idempotencyKey_key"
  ON "ProfileStockMovement"("idempotencyKey");
CREATE INDEX "ProfileStockMovement_entityId_createdAt_idx"
  ON "ProfileStockMovement"("entityId", "createdAt");
CREATE INDEX "ProfileStockMovement_sourceType_sourceId_idx"
  ON "ProfileStockMovement"("sourceType", "sourceId");
CREATE INDEX "ProfileStockMovement_sourceMovementId_idx"
  ON "ProfileStockMovement"("sourceMovementId");

-- Existing role and group rows are updated here; ensureDefaultPermissions also
-- creates the same resource for databases initialized after this migration.
INSERT OR IGNORE INTO "PermissionSetting"
  ("id", "role", "resource", "canRead", "canCreate", "canUpdate", "canDelete", "canGrant", "updatedAt")
VALUES
  ('profile-stock-operator', 'OPERATOR', 'profileStock', true, false, false, false, false, CURRENT_TIMESTAMP),
  ('profile-stock-auditor', 'AUDITOR', 'profileStock', true, false, true, false, false, CURRENT_TIMESTAMP),
  ('profile-stock-admin', 'ADMIN', 'profileStock', true, true, true, true, true, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "PermissionGroupSetting"
  ("id", "groupId", "resource", "canRead", "canCreate", "canUpdate", "canDelete", "canGrant", "updatedAt")
SELECT
  'profile-stock-group-' || "code",
  "id",
  'profileStock',
  true,
  false,
  CASE WHEN "code" IN ('business_audit', 'system_admin') THEN true ELSE false END,
  false,
  CASE WHEN "code" = 'system_admin' THEN true ELSE false END,
  CURRENT_TIMESTAMP
FROM "PermissionGroup"
WHERE "code" IN ('basic_entry', 'business_audit', 'system_admin');
