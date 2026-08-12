ALTER TABLE "Operator" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Operator" ADD COLUMN "lockedUntil" DATETIME;
ALTER TABLE "Operator" ADD COLUMN "lastFailedLoginAt" DATETIME;

CREATE TABLE "AuthenticationThrottle" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scope" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "windowStartedAt" DATETIME NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "blockedUntil" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "AuthenticationThrottle_scope_keyHash_key" ON "AuthenticationThrottle"("scope", "keyHash");
CREATE INDEX "AuthenticationThrottle_blockedUntil_idx" ON "AuthenticationThrottle"("blockedUntil");
CREATE INDEX "AuthenticationThrottle_updatedAt_idx" ON "AuthenticationThrottle"("updatedAt");
