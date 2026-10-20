-- CreateTable
CREATE TABLE "TaskCollaboration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "salesOrderId" TEXT,
    "productionOrderId" TEXT,
    "dispatchId" TEXT,
    "assigneeEmployeeId" TEXT,
    "supplierId" TEXT,
    "workCenterId" TEXT,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "dueAt" DATETIME,
    "instructions" TEXT,
    "documentRefsJson" TEXT NOT NULL DEFAULT '[]',
    "createdBy" TEXT NOT NULL,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskCollaboration_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TaskCollaboration_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TaskCollaboration_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TaskCollaboration_assigneeEmployeeId_fkey" FOREIGN KEY ("assigneeEmployeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TaskCollaboration_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TaskCollaboration_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskCollaborationLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "note" TEXT,
    "documentRefsJson" TEXT NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TaskCollaborationLine_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskCollaboration" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskCollaborationLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskCollaborationProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "attachmentRefsJson" TEXT NOT NULL DEFAULT '[]',
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskCollaborationProgress_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskCollaboration" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskCollaborationRelease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "operationId" TEXT NOT NULL,
    "manifestJson" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskCollaborationRelease_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskCollaboration" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskCollaborationDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "releaseId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskCollaborationDelivery_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "TaskCollaborationRelease" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskCollaboration_taskNo_key" ON "TaskCollaboration"("taskNo");

-- CreateIndex
CREATE INDEX "TaskCollaboration_deletedAt_status_updatedAt_idx" ON "TaskCollaboration"("deletedAt", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "TaskCollaboration_assigneeEmployeeId_idx" ON "TaskCollaboration"("assigneeEmployeeId");

-- CreateIndex
CREATE INDEX "TaskCollaboration_workCenterId_idx" ON "TaskCollaboration"("workCenterId");

-- CreateIndex
CREATE INDEX "TaskCollaborationLine_taskId_sortOrder_idx" ON "TaskCollaborationLine"("taskId", "sortOrder");

-- CreateIndex
CREATE INDEX "TaskCollaborationProgress_taskId_createdAt_idx" ON "TaskCollaborationProgress"("taskId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCollaborationRelease_operationId_key" ON "TaskCollaborationRelease"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCollaborationRelease_taskId_revision_key" ON "TaskCollaborationRelease"("taskId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCollaborationDelivery_operationId_key" ON "TaskCollaborationDelivery"("operationId");

-- CreateIndex
CREATE INDEX "TaskCollaborationDelivery_releaseId_createdAt_idx" ON "TaskCollaborationDelivery"("releaseId", "createdAt");


-- Published manifests, progress and delivery records are append-only facts.
CREATE TRIGGER "TaskCollaborationRelease_no_update" BEFORE UPDATE ON "TaskCollaborationRelease" BEGIN SELECT RAISE(ABORT, 'Task release is immutable'); END;
CREATE TRIGGER "TaskCollaborationRelease_no_delete" BEFORE DELETE ON "TaskCollaborationRelease" BEGIN SELECT RAISE(ABORT, 'Task release is immutable'); END;
CREATE TRIGGER "TaskCollaborationProgress_no_update" BEFORE UPDATE ON "TaskCollaborationProgress" BEGIN SELECT RAISE(ABORT, 'Task progress is append-only'); END;
CREATE TRIGGER "TaskCollaborationProgress_no_delete" BEFORE DELETE ON "TaskCollaborationProgress" BEGIN SELECT RAISE(ABORT, 'Task progress is append-only'); END;
CREATE TRIGGER "TaskCollaborationDelivery_no_update" BEFORE UPDATE ON "TaskCollaborationDelivery" BEGIN SELECT RAISE(ABORT, 'Task delivery is append-only'); END;
CREATE TRIGGER "TaskCollaborationDelivery_no_delete" BEFORE DELETE ON "TaskCollaborationDelivery" BEGIN SELECT RAISE(ABORT, 'Task delivery is append-only'); END;
CREATE TRIGGER "TaskReleaseAttachment_protect" BEFORE UPDATE ON "DocumentAttachment"
WHEN OLD.documentType = 'SYSTEM_GENERATED_TASK_RELEASE' AND
(NEW.ownerType IS NOT OLD.ownerType OR NEW.ownerId IS NOT OLD.ownerId OR NEW.documentType IS NOT OLD.documentType OR NEW.originalName IS NOT OLD.originalName OR NEW.storagePath IS NOT OLD.storagePath OR NEW.fileName IS NOT OLD.fileName OR NEW.mimeType IS NOT OLD.mimeType OR NEW.size IS NOT OLD.size OR NEW.deletedAt IS NOT OLD.deletedAt OR NEW.rotation IS NOT OLD.rotation)
BEGIN SELECT RAISE(ABORT, 'Task release file is immutable'); END;
CREATE TRIGGER "TaskReleaseAttachment_no_delete" BEFORE DELETE ON "DocumentAttachment" WHEN OLD.documentType = 'SYSTEM_GENERATED_TASK_RELEASE'
BEGIN SELECT RAISE(ABORT, 'Task release file is immutable'); END;
