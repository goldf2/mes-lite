CREATE TABLE "WorkCenter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "equipmentType" TEXT NOT NULL,
    "model" TEXT,
    "manufacturer" TEXT,
    "serialNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "location" TEXT,
    "basicParameters" TEXT,
    "note" TEXT,
    "workCenterId" TEXT NOT NULL,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Equipment_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "_WorkCenterToWorkInstruction" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_WorkCenterToWorkInstruction_A_fkey" FOREIGN KEY ("A") REFERENCES "WorkCenter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_WorkCenterToWorkInstruction_B_fkey" FOREIGN KEY ("B") REFERENCES "WorkInstruction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkCenter_code_key" ON "WorkCenter"("code");
CREATE INDEX "WorkCenter_isActive_idx" ON "WorkCenter"("isActive");
CREATE UNIQUE INDEX "Equipment_code_key" ON "Equipment"("code");
CREATE INDEX "Equipment_workCenterId_idx" ON "Equipment"("workCenterId");
CREATE INDEX "Equipment_status_idx" ON "Equipment"("status");
CREATE INDEX "Equipment_deletedAt_idx" ON "Equipment"("deletedAt");
CREATE UNIQUE INDEX "_WorkCenterToWorkInstruction_AB_unique" ON "_WorkCenterToWorkInstruction"("A", "B");
CREATE INDEX "_WorkCenterToWorkInstruction_B_index" ON "_WorkCenterToWorkInstruction"("B");
