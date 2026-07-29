ALTER TABLE "ScanCountSession" ADD COLUMN "clientRequestId" TEXT;
CREATE UNIQUE INDEX "ScanCountSession_clientRequestId_key" ON "ScanCountSession"("clientRequestId");

ALTER TABLE "ScanCountEvent" ADD COLUMN "clientEventId" TEXT;
CREATE UNIQUE INDEX "ScanCountEvent_clientEventId_key" ON "ScanCountEvent"("clientEventId");

ALTER TABLE "LabelPrintJob" ADD COLUMN "clientRequestId" TEXT;
CREATE UNIQUE INDEX "LabelPrintJob_clientRequestId_key" ON "LabelPrintJob"("clientRequestId");
