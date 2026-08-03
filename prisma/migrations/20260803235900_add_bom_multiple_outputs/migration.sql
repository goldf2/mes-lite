CREATE TABLE "BOMOutput" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bomId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BOMOutput_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "BOM" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BOMOutput_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "BOMOutput" ("id", "bomId", "materialId", "quantity", "unit", "isPrimary")
SELECT lower(hex(randomblob(16))), b."id", m."id", b."outputQuantity", b."outputUnit", true
FROM "BOM" b
JOIN "Product" p ON p."id" = b."productId"
JOIN "Material" m ON p."sku" = m."code" OR p."sku" = 'MAT-' || m."code";

CREATE UNIQUE INDEX "BOMOutput_bomId_materialId_key" ON "BOMOutput"("bomId", "materialId");
CREATE INDEX "BOMOutput_materialId_idx" ON "BOMOutput"("materialId");
CREATE INDEX "BOMOutput_bomId_isPrimary_idx" ON "BOMOutput"("bomId", "isPrimary");

ALTER TABLE "BOM" DROP COLUMN "bomType";
