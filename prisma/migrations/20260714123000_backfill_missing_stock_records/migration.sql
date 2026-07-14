INSERT INTO "Stock" (
  "id",
  "materialId",
  "productId",
  "qty",
  "reservedQty",
  "availableQty",
  "valuationQty",
  "reservedValuationQty",
  "availableValuationQty",
  "totalCost",
  "valuationUnitCost",
  "stockUnitCost"
)
SELECT
  'stock_' || lower(hex(randomblob(12))),
  "Material"."id",
  NULL,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0
FROM "Material"
WHERE NOT EXISTS (
  SELECT 1
  FROM "Stock"
  WHERE "Stock"."materialId" = "Material"."id"
);

INSERT INTO "Stock" (
  "id",
  "materialId",
  "productId",
  "qty",
  "reservedQty",
  "availableQty",
  "valuationQty",
  "reservedValuationQty",
  "availableValuationQty",
  "totalCost",
  "valuationUnitCost",
  "stockUnitCost"
)
SELECT
  'stock_' || lower(hex(randomblob(12))),
  NULL,
  "Product"."id",
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0
FROM "Product"
WHERE NOT EXISTS (
  SELECT 1
  FROM "Stock"
  WHERE "Stock"."productId" = "Product"."id"
);
