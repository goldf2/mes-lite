ALTER TABLE "OperatorSession" ADD COLUMN "authSource" TEXT NOT NULL DEFAULT 'native';
ALTER TABLE "OperatorSession" ADD COLUMN "authAccountId" TEXT;
ALTER TABLE "OperatorSession" ADD COLUMN "authSubject" TEXT;
ALTER TABLE "OperatorSession" ADD COLUMN "authGeneration" TEXT;
CREATE TABLE "OperatorLoginChallenge" (
  "ticketHash" TEXT NOT NULL PRIMARY KEY,
  "consumedAt" DATETIME,
  "sessionId" TEXT,
  "verifier" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "generation" TEXT NOT NULL,
  "returnPath" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "OperatorLoginChallenge_expiresAt_idx" ON "OperatorLoginChallenge"("expiresAt");
