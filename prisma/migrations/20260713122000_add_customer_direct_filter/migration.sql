CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

ALTER TABLE "Product" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Material" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "customerId" TEXT;

CREATE INDEX "Product_customerId_idx" ON "Product"("customerId");
CREATE INDEX "Material_customerId_idx" ON "Material"("customerId");
CREATE INDEX "Shipment_customerId_idx" ON "Shipment"("customerId");
