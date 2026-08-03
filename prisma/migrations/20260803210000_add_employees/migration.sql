-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "phone" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DailyProductionReportEmployee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "employeeId" TEXT,
    "employeeCode" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyProductionReportEmployee_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DailyProductionReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyProductionReportEmployee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FlowTransfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transferNo" TEXT NOT NULL,
    "transferDate" DATETIME NOT NULL,
    "materialId" TEXT NOT NULL,
    "sourceLocationId" TEXT NOT NULL,
    "targetLocationId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "employeeId" TEXT,
    "employeeCode" TEXT,
    "operator" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "confirmedAt" DATETIME,
    "confirmedBy" TEXT,
    "reversedAt" DATETIME,
    "reversedBy" TEXT,
    "reverseReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FlowTransfer_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FlowTransfer_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "InventoryLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FlowTransfer_targetLocationId_fkey" FOREIGN KEY ("targetLocationId") REFERENCES "InventoryLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FlowTransfer_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FlowTransfer" ("confirmedAt", "confirmedBy", "createdAt", "id", "materialId", "note", "operator", "quantity", "reverseReason", "reversedAt", "reversedBy", "sourceLocationId", "status", "targetLocationId", "transferDate", "transferNo", "unit", "updatedAt") SELECT "confirmedAt", "confirmedBy", "createdAt", "id", "materialId", "note", "operator", "quantity", "reverseReason", "reversedAt", "reversedBy", "sourceLocationId", "status", "targetLocationId", "transferDate", "transferNo", "unit", "updatedAt" FROM "FlowTransfer";
DROP TABLE "FlowTransfer";
ALTER TABLE "new_FlowTransfer" RENAME TO "FlowTransfer";
CREATE UNIQUE INDEX "FlowTransfer_transferNo_key" ON "FlowTransfer"("transferNo");
CREATE INDEX "FlowTransfer_transferDate_idx" ON "FlowTransfer"("transferDate");
CREATE INDEX "FlowTransfer_materialId_idx" ON "FlowTransfer"("materialId");
CREATE INDEX "FlowTransfer_sourceLocationId_idx" ON "FlowTransfer"("sourceLocationId");
CREATE INDEX "FlowTransfer_targetLocationId_idx" ON "FlowTransfer"("targetLocationId");
CREATE INDEX "FlowTransfer_employeeId_idx" ON "FlowTransfer"("employeeId");
CREATE INDEX "FlowTransfer_status_idx" ON "FlowTransfer"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Employee_code_key" ON "Employee"("code");
CREATE INDEX "Employee_isActive_idx" ON "Employee"("isActive");
CREATE INDEX "Employee_name_idx" ON "Employee"("name");
CREATE UNIQUE INDEX "DailyProductionReportEmployee_reportId_employeeId_key" ON "DailyProductionReportEmployee"("reportId", "employeeId");
CREATE INDEX "DailyProductionReportEmployee_employeeId_idx" ON "DailyProductionReportEmployee"("employeeId");
