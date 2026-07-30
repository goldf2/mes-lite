-- Existing work instructions are intentionally discarded because the new model
-- requires every instruction to be linked directly to a product/material.
DELETE FROM "DocumentAttachment"
WHERE "ownerType" = 'WORK_INSTRUCTION';

DELETE FROM "WorkInstruction";

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_WorkInstruction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL DEFAULT 'WORK_INSTRUCTION',
    "version" TEXT NOT NULL DEFAULT 'v1',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "materialId" TEXT NOT NULL,
    "processName" TEXT,
    "note" TEXT,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkInstruction_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

DROP TABLE "WorkInstruction";
ALTER TABLE "new_WorkInstruction" RENAME TO "WorkInstruction";

CREATE INDEX "WorkInstruction_category_idx" ON "WorkInstruction"("category");
CREATE INDEX "WorkInstruction_status_idx" ON "WorkInstruction"("status");
CREATE INDEX "WorkInstruction_materialId_idx" ON "WorkInstruction"("materialId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
