-- Make material inbound quoted price unit explicit.

ALTER TABLE "MaterialIn" ADD COLUMN "priceBasis" TEXT NOT NULL DEFAULT 'VALUATION';
ALTER TABLE "MaterialIn" ADD COLUMN "priceUnit" TEXT;
ALTER TABLE "MaterialIn" ADD COLUMN "valuationUnitCost" REAL NOT NULL DEFAULT 0;

UPDATE "MaterialIn"
SET
  "priceUnit" = "valuationUnit",
  "valuationUnitCost" = "unitPrice"
WHERE "valuationUnitCost" = 0;
