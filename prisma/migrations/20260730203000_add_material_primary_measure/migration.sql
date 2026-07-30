ALTER TABLE "Material" ADD COLUMN "primaryMeasure" TEXT NOT NULL DEFAULT 'QUANTITY';
ALTER TABLE "Material" ADD COLUMN "referenceMeasure" TEXT;

UPDATE "Material"
SET "primaryMeasure" = 'LENGTH'
WHERE lower("stockUnit") IN ('m', 'mm', 'cm', 'km') OR "stockUnit" IN ('米', '毫米', '厘米', '千米');

UPDATE "Material"
SET "primaryMeasure" = 'WEIGHT'
WHERE lower("stockUnit") IN ('kg', 'g', 't') OR "stockUnit" IN ('千克', '公斤', '克', '吨');

UPDATE "Material"
SET "referenceMeasure" = 'LENGTH'
WHERE "unitMode" = 'DUAL'
  AND (lower("valuationUnit") IN ('m', 'mm', 'cm', 'km') OR "valuationUnit" IN ('米', '毫米', '厘米', '千米'));

UPDATE "Material"
SET "referenceMeasure" = 'WEIGHT'
WHERE "unitMode" = 'DUAL'
  AND (lower("valuationUnit") IN ('kg', 'g', 't') OR "valuationUnit" IN ('千克', '公斤', '克', '吨'));

UPDATE "Material"
SET "referenceMeasure" = 'OTHER'
WHERE "unitMode" = 'DUAL' AND "referenceMeasure" IS NULL;

ALTER TABLE "MaterialIn" ADD COLUMN "pieceCount" INTEGER;
ALTER TABLE "MaterialIn" ADD COLUMN "stockQtyMode" TEXT NOT NULL DEFAULT 'TOTAL';
ALTER TABLE "MaterialIn" ADD COLUMN "stockQtyInput" REAL;
