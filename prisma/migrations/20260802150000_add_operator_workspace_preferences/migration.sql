CREATE TABLE "OperatorWorkspacePreference" (
    "operatorId" TEXT NOT NULL PRIMARY KEY,
    "mode" TEXT NOT NULL DEFAULT 'DEFAULT',
    "layoutJson" TEXT NOT NULL DEFAULT '[]',
    "pinnedJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OperatorWorkspacePreference_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "OperatorFunctionUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorId" TEXT NOT NULL,
    "functionKey" TEXT NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OperatorFunctionUsage_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OperatorFunctionUsage_operatorId_functionKey_key" ON "OperatorFunctionUsage"("operatorId", "functionKey");
CREATE INDEX "OperatorFunctionUsage_operatorId_useCount_idx" ON "OperatorFunctionUsage"("operatorId", "useCount");
