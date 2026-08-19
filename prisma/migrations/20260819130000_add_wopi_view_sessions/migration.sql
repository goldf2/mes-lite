CREATE TABLE "WopiViewSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "lastAccessedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WopiViewSession_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "DocumentAttachment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WopiViewSession_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WopiViewSession_tokenHash_key" ON "WopiViewSession"("tokenHash");
CREATE INDEX "WopiViewSession_attachmentId_expiresAt_idx" ON "WopiViewSession"("attachmentId", "expiresAt");
CREATE INDEX "WopiViewSession_operatorId_expiresAt_idx" ON "WopiViewSession"("operatorId", "expiresAt");
CREATE INDEX "WopiViewSession_expiresAt_idx" ON "WopiViewSession"("expiresAt");
