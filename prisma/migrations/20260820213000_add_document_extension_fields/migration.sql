CREATE TABLE "DocumentFieldDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL DEFAULT 'TEXT',
    "optionsJson" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentFieldDefinition_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DocumentCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "WorkInstructionFieldValue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workInstructionId" TEXT NOT NULL,
    "fieldDefinitionId" TEXT NOT NULL,
    "valueText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkInstructionFieldValue_workInstructionId_fkey" FOREIGN KEY ("workInstructionId") REFERENCES "WorkInstruction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkInstructionFieldValue_fieldDefinitionId_fkey" FOREIGN KEY ("fieldDefinitionId") REFERENCES "DocumentFieldDefinition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DocumentFieldDefinition_categoryId_name_key" ON "DocumentFieldDefinition"("categoryId", "name");
CREATE INDEX "DocumentFieldDefinition_categoryId_sortOrder_idx" ON "DocumentFieldDefinition"("categoryId", "sortOrder");
CREATE UNIQUE INDEX "WorkInstructionFieldValue_workInstructionId_fieldDefinitionId_key" ON "WorkInstructionFieldValue"("workInstructionId", "fieldDefinitionId");
CREATE INDEX "WorkInstructionFieldValue_fieldDefinitionId_idx" ON "WorkInstructionFieldValue"("fieldDefinitionId");
