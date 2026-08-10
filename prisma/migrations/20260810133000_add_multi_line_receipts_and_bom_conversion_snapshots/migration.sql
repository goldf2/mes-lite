CREATE TABLE "MaterialReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "inboundNo" TEXT NOT NULL,
  "voucherNo" TEXT,
  "supplierId" TEXT NOT NULL,
  "stagingLocationId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "inboundDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "receivedBy" TEXT,
  "note" TEXT,
  "deletedAt" DATETIME,
  "deletedBy" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MaterialReceipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MaterialReceipt_stagingLocationId_fkey" FOREIGN KEY ("stagingLocationId") REFERENCES "InventoryLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MaterialReceipt_inboundNo_key" ON "MaterialReceipt"("inboundNo");
CREATE INDEX "MaterialReceipt_supplierId_idx" ON "MaterialReceipt"("supplierId");
CREATE INDEX "MaterialReceipt_stagingLocationId_idx" ON "MaterialReceipt"("stagingLocationId");
CREATE INDEX "MaterialReceipt_status_idx" ON "MaterialReceipt"("status");
CREATE INDEX "MaterialReceipt_inboundDate_idx" ON "MaterialReceipt"("inboundDate");

ALTER TABLE "MaterialIn" ADD COLUMN "receiptId" TEXT REFERENCES "MaterialReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialIn" ADD COLUMN "lineNo" INTEGER NOT NULL DEFAULT 1;

INSERT INTO "InventoryLocation" (
  "id", "code", "name", "note", "isDefault", "isActive", "sortOrder", "deletedAt", "createdAt", "updatedAt"
)
SELECT
  'migration-inbound-staging', 'INBOUND-STAGING', '来料待分库', '迁移历史来料单时自动建立的统一待分库库位',
  1, 1, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "MaterialIn")
  AND NOT EXISTS (SELECT 1 FROM "InventoryLocation");

INSERT INTO "MaterialReceipt" (
  "id", "inboundNo", "voucherNo", "supplierId", "stagingLocationId", "status",
  "inboundDate", "receivedBy", "note", "deletedAt", "deletedBy", "createdAt", "updatedAt"
)
SELECT
  mi."id", mi."inboundNo", mi."voucherNo", mi."supplierId",
  COALESCE(
    mi."locationId",
    (SELECT il."id" FROM "InventoryLocation" il ORDER BY (il."deletedAt" IS NULL AND il."isActive" = 1) DESC, il."isDefault" DESC, il."sortOrder" ASC LIMIT 1)
  ),
  mi."status", mi."inboundDate", mi."receivedBy", mi."note", mi."deletedAt", mi."deletedBy", mi."createdAt", CURRENT_TIMESTAMP
FROM "MaterialIn" mi;

UPDATE "MaterialIn" SET "receiptId" = "id", "lineNo" = 1 WHERE "receiptId" IS NULL;
CREATE INDEX "MaterialIn_receiptId_lineNo_idx" ON "MaterialIn"("receiptId", "lineNo");

ALTER TABLE "BOMItem" ADD COLUMN "entryQuantity" REAL;
ALTER TABLE "BOMItem" ADD COLUMN "conversionRateUsed" REAL;
ALTER TABLE "BOMItem" ADD COLUMN "conversionSource" TEXT;
ALTER TABLE "BOMItem" ADD COLUMN "unitVersionUsed" INTEGER;

ALTER TABLE "BOMOutput" ADD COLUMN "entryQuantity" REAL;
ALTER TABLE "BOMOutput" ADD COLUMN "conversionRateUsed" REAL;
ALTER TABLE "BOMOutput" ADD COLUMN "conversionSource" TEXT;
ALTER TABLE "BOMOutput" ADD COLUMN "unitVersionUsed" INTEGER;
