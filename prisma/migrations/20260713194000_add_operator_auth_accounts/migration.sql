CREATE TABLE "OperatorAuthAccount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "operatorId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerUserId" TEXT NOT NULL,
  "unionId" TEXT,
  "nickname" TEXT,
  "avatarUrl" TEXT,
  "rawData" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "OperatorAuthAccount_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OperatorAuthAccount_provider_providerUserId_key" ON "OperatorAuthAccount"("provider", "providerUserId");
CREATE INDEX "OperatorAuthAccount_operatorId_idx" ON "OperatorAuthAccount"("operatorId");
CREATE INDEX "OperatorAuthAccount_unionId_idx" ON "OperatorAuthAccount"("unionId");
