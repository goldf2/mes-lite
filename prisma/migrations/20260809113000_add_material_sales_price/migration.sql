ALTER TABLE "Material" ADD COLUMN "defaultSalePrice" REAL;
ALTER TABLE "Material" ADD COLUMN "salesCurrency" TEXT NOT NULL DEFAULT 'CNY';

ALTER TABLE "SalesOrder" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CNY';

ALTER TABLE "SalesOrderItem" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CNY';
ALTER TABLE "SalesOrderItem" ADD COLUMN "priceSource" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "SalesOrderItem" ADD COLUMN "defaultSalePriceSnapshot" REAL;
ALTER TABLE "SalesOrderItem" ADD COLUMN "priceAdjustedAt" DATETIME;
ALTER TABLE "SalesOrderItem" ADD COLUMN "priceAdjustedBy" TEXT;
ALTER TABLE "SalesOrderItem" ADD COLUMN "priceAdjustReason" TEXT;
