CREATE TABLE "CustomerMasterLink" (
 "customerId" TEXT NOT NULL PRIMARY KEY,
 "instanceId" TEXT NOT NULL,
 "enterpriseId" TEXT NOT NULL,
 "boundRevision" INTEGER NOT NULL,
 "revision" INTEGER NOT NULL DEFAULT 1,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL,
 CONSTRAINT "CustomerMasterLink_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CustomerMasterLink_instanceId_enterpriseId_key" ON "CustomerMasterLink"("instanceId", "enterpriseId");
ALTER TABLE "Shipment" ADD COLUMN "customerMasterSnapshot" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "customerMasterSnapshot" TEXT;
