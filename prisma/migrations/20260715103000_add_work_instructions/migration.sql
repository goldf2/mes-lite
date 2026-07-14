CREATE TABLE "WorkInstruction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'PROCESS',
    "version" TEXT NOT NULL DEFAULT 'v1',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "customerId" TEXT,
    "materialId" TEXT,
    "processName" TEXT,
    "note" TEXT,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkInstruction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkInstruction_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkInstruction_code_key" ON "WorkInstruction"("code");
CREATE INDEX "WorkInstruction_category_idx" ON "WorkInstruction"("category");
CREATE INDEX "WorkInstruction_status_idx" ON "WorkInstruction"("status");
CREATE INDEX "WorkInstruction_customerId_idx" ON "WorkInstruction"("customerId");
CREATE INDEX "WorkInstruction_materialId_idx" ON "WorkInstruction"("materialId");
