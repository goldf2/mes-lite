-- CreateTable
CREATE TABLE "FlowTransfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transferNo" TEXT NOT NULL,
    "transferDate" DATETIME NOT NULL,
    "materialId" TEXT NOT NULL,
    "sourceLocationId" TEXT NOT NULL,
    "targetLocationId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL,
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
    CONSTRAINT "FlowTransfer_targetLocationId_fkey" FOREIGN KEY ("targetLocationId") REFERENCES "InventoryLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FlowTransfer_transferNo_key" ON "FlowTransfer"("transferNo");

-- CreateIndex
CREATE INDEX "FlowTransfer_transferDate_idx" ON "FlowTransfer"("transferDate");

-- CreateIndex
CREATE INDEX "FlowTransfer_materialId_idx" ON "FlowTransfer"("materialId");

-- CreateIndex
CREATE INDEX "FlowTransfer_sourceLocationId_idx" ON "FlowTransfer"("sourceLocationId");

-- CreateIndex
CREATE INDEX "FlowTransfer_targetLocationId_idx" ON "FlowTransfer"("targetLocationId");

-- CreateIndex
CREATE INDEX "FlowTransfer_status_idx" ON "FlowTransfer"("status");
