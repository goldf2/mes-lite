CREATE TABLE "ScanCountSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionNo" TEXT NOT NULL,
    "name" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'SHIPMENT',
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "expectedCode" TEXT NOT NULL,
    "expectedQty" REAL NOT NULL,
    "countedQty" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "scannerModel" TEXT,
    "createdBy" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ScanCountSession_sessionNo_key" ON "ScanCountSession"("sessionNo");
CREATE INDEX "ScanCountSession_referenceType_referenceId_status_idx" ON "ScanCountSession"("referenceType", "referenceId", "status");

CREATE TABLE "ScanCountEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "rawValue" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 1,
    "result" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScanCountEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScanCountSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ScanCountEvent_sessionId_createdAt_idx" ON "ScanCountEvent"("sessionId", "createdAt");

CREATE TABLE "LabelPrintJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobNo" TEXT NOT NULL,
    "templateType" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "printerModel" TEXT NOT NULL,
    "printerDpi" INTEGER NOT NULL,
    "printerIp" TEXT,
    "labelWidthMm" REAL NOT NULL,
    "labelHeightMm" REAL NOT NULL,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "payloadJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requestedBy" TEXT,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "LabelPrintJob_jobNo_key" ON "LabelPrintJob"("jobNo");
CREATE INDEX "LabelPrintJob_referenceType_referenceId_requestedAt_idx" ON "LabelPrintJob"("referenceType", "referenceId", "requestedAt");
