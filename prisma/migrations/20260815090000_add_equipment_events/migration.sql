-- CreateTable
CREATE TABLE "EquipmentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "equipmentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sourceStatus" TEXT NOT NULL,
    "targetStatus" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "operatorId" TEXT,
    "operatorName" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationSeconds" INTEGER,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EquipmentEvent_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EquipmentEvent_equipmentId_occurredAt_idx" ON "EquipmentEvent"("equipmentId", "occurredAt");

-- CreateIndex
CREATE INDEX "EquipmentEvent_eventType_occurredAt_idx" ON "EquipmentEvent"("eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "EquipmentEvent_endedAt_idx" ON "EquipmentEvent"("endedAt");

-- New equipment must start from the neutral status. Existing rows are untouched.
CREATE TRIGGER "Equipment_available_on_create"
BEFORE INSERT ON "Equipment"
WHEN NEW."status" <> 'AVAILABLE'
BEGIN
    SELECT RAISE(ABORT, 'New equipment must start as AVAILABLE');
END;

-- A status snapshot may change only when the latest event describes the same transition.
CREATE TRIGGER "Equipment_status_requires_latest_event"
BEFORE UPDATE OF "status" ON "Equipment"
WHEN NEW."status" <> OLD."status"
  AND NOT EXISTS (
      SELECT 1
      FROM "EquipmentEvent"
      WHERE "id" = (
          SELECT "id"
          FROM "EquipmentEvent"
          WHERE "equipmentId" = OLD."id"
          ORDER BY "createdAt" DESC, rowid DESC
          LIMIT 1
      )
        AND "sourceStatus" = OLD."status"
        AND "targetStatus" = NEW."status"
  )
BEGIN
    SELECT RAISE(ABORT, 'Equipment status change requires a matching latest event');
END;

-- Inserting the event applies its target snapshot in the same database statement.
CREATE TRIGGER "EquipmentEvent_validate_insert"
BEFORE INSERT ON "EquipmentEvent"
WHEN trim(NEW."reason") = ''
  OR trim(NEW."operatorName") = ''
  OR NOT EXISTS (
      SELECT 1
      FROM "Equipment"
      WHERE "id" = NEW."equipmentId"
        AND "deletedAt" IS NULL
        AND "status" = NEW."sourceStatus"
  )
  OR NOT (
      (NEW."eventType" = 'START' AND NEW."sourceStatus" = 'AVAILABLE' AND NEW."targetStatus" = 'IN_USE')
      OR (NEW."eventType" = 'STOP' AND NEW."sourceStatus" IN ('AVAILABLE', 'IN_USE') AND NEW."targetStatus" = 'STOPPED')
      OR (NEW."eventType" = 'FAULT' AND NEW."sourceStatus" IN ('AVAILABLE', 'IN_USE') AND NEW."targetStatus" = 'FAULT')
      OR (NEW."eventType" = 'RECOVER' AND NEW."sourceStatus" IN ('STOPPED', 'FAULT', 'MAINTENANCE') AND NEW."targetStatus" = 'AVAILABLE')
      OR (NEW."eventType" = 'ARCHIVE' AND NEW."targetStatus" = 'STOPPED')
  )
BEGIN
    SELECT RAISE(ABORT, 'Invalid equipment event transition or inactive equipment');
END;

CREATE TRIGGER "EquipmentEvent_apply_status"
AFTER INSERT ON "EquipmentEvent"
BEGIN
    UPDATE "Equipment"
    SET "status" = NEW."targetStatus"
    WHERE "id" = NEW."equipmentId"
      AND "status" = NEW."sourceStatus";
    SELECT CASE
        WHEN changes() <> 1
        THEN RAISE(ABORT, 'Equipment event source status does not match current status')
    END;
END;

-- Command facts are append-only; recovery/archive may only fill closure metadata once.
CREATE TRIGGER "EquipmentEvent_restrict_update"
BEFORE UPDATE ON "EquipmentEvent"
WHEN NEW."id" IS NOT OLD."id"
  OR NEW."equipmentId" IS NOT OLD."equipmentId"
  OR NEW."eventType" IS NOT OLD."eventType"
  OR NEW."sourceStatus" IS NOT OLD."sourceStatus"
  OR NEW."targetStatus" IS NOT OLD."targetStatus"
  OR NEW."reason" IS NOT OLD."reason"
  OR NEW."note" IS NOT OLD."note"
  OR NEW."operatorId" IS NOT OLD."operatorId"
  OR NEW."operatorName" IS NOT OLD."operatorName"
  OR NEW."occurredAt" IS NOT OLD."occurredAt"
  OR NEW."createdAt" IS NOT OLD."createdAt"
  OR OLD."endedAt" IS NOT NULL
  OR OLD."durationSeconds" IS NOT NULL
  OR NEW."endedAt" IS NULL
  OR NEW."durationSeconds" IS NULL
  OR NEW."durationSeconds" < 0
BEGIN
    SELECT RAISE(ABORT, 'Equipment events are append-only except one-time closure metadata');
END;

CREATE TRIGGER "EquipmentEvent_prevent_delete"
BEFORE DELETE ON "EquipmentEvent"
BEGIN
    SELECT RAISE(ABORT, 'Equipment events cannot be deleted');
END;
