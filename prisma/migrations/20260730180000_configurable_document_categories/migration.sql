PRAGMA foreign_keys=OFF;

CREATE TABLE "DocumentCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DocumentCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "DocumentCategory" ("id", "name", "sortOrder", "updatedAt") VALUES
    ('doc-category-work-instruction', '作业指导书', 10, CURRENT_TIMESTAMP),
    ('doc-category-drawing', '图纸', 20, CURRENT_TIMESTAMP),
    ('doc-category-process', '工艺文件', 30, CURRENT_TIMESTAMP),
    ('doc-category-quality', '检验文件', 40, CURRENT_TIMESTAMP),
    ('doc-category-packaging', '包装文件', 50, CURRENT_TIMESTAMP),
    ('doc-category-equipment', '设备文件', 60, CURRENT_TIMESTAMP),
    ('doc-category-other', '其他', 70, CURRENT_TIMESTAMP);

CREATE TABLE "new_WorkInstruction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "materialId" TEXT NOT NULL,
    "note" TEXT,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkInstruction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DocumentCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkInstruction_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_WorkInstruction" ("id", "categoryId", "version", "status", "materialId", "note", "deletedAt", "deletedBy", "createdAt", "updatedAt")
SELECT
    "id",
    CASE "category"
        WHEN 'DRAWING' THEN 'doc-category-drawing'
        WHEN 'PROCESS' THEN 'doc-category-process'
        WHEN 'QUALITY' THEN 'doc-category-quality'
        WHEN 'PACKAGING' THEN 'doc-category-packaging'
        WHEN 'EQUIPMENT' THEN 'doc-category-equipment'
        WHEN 'OTHER' THEN 'doc-category-other'
        ELSE 'doc-category-work-instruction'
    END,
    "version",
    "status",
    "materialId",
    "note",
    "deletedAt",
    "deletedBy",
    "createdAt",
    "updatedAt"
FROM "WorkInstruction";

DROP TABLE "WorkInstruction";
ALTER TABLE "new_WorkInstruction" RENAME TO "WorkInstruction";

CREATE INDEX "DocumentCategory_parentId_idx" ON "DocumentCategory"("parentId");
CREATE INDEX "DocumentCategory_sortOrder_idx" ON "DocumentCategory"("sortOrder");
CREATE INDEX "WorkInstruction_categoryId_idx" ON "WorkInstruction"("categoryId");
CREATE INDEX "WorkInstruction_status_idx" ON "WorkInstruction"("status");
CREATE INDEX "WorkInstruction_materialId_idx" ON "WorkInstruction"("materialId");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
