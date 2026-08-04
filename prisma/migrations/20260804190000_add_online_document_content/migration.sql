PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_WorkInstruction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "materialId" TEXT,
    "contentJson" TEXT,
    "contentText" TEXT,
    "note" TEXT,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkInstruction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DocumentCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkInstruction_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_WorkInstruction" (
    "id", "categoryId", "title", "version", "status", "materialId", "note", "deletedAt", "deletedBy", "createdAt", "updatedAt"
)
SELECT
    wi."id",
    wi."categoryId",
    COALESCE((SELECT m."name" FROM "Material" m WHERE m."id" = wi."materialId"), '未命名文档'),
    wi."version",
    wi."status",
    wi."materialId",
    wi."note",
    wi."deletedAt",
    wi."deletedBy",
    wi."createdAt",
    wi."updatedAt"
FROM "WorkInstruction" wi;

DROP TABLE "WorkInstruction";
ALTER TABLE "new_WorkInstruction" RENAME TO "WorkInstruction";
CREATE INDEX "WorkInstruction_categoryId_idx" ON "WorkInstruction"("categoryId");
CREATE INDEX "WorkInstruction_status_idx" ON "WorkInstruction"("status");
CREATE INDEX "WorkInstruction_materialId_idx" ON "WorkInstruction"("materialId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
