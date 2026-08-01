CREATE TABLE "InventoryLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "InventoryLocation_code_key" ON "InventoryLocation"("code");

CREATE TABLE "StockLocationBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stockId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "qty" REAL NOT NULL DEFAULT 0,
    "reservedQty" REAL NOT NULL DEFAULT 0,
    "availableQty" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockLocationBalance_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockLocationBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StockLocationBalance_stockId_locationId_key" ON "StockLocationBalance"("stockId", "locationId");
CREATE INDEX "StockLocationBalance_locationId_idx" ON "StockLocationBalance"("locationId");

ALTER TABLE "StockLog" ADD COLUMN "locationId" TEXT REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaterialIn" ADD COLUMN "locationId" TEXT REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DailyProductionReport" ADD COLUMN "consumptionLocationId" TEXT REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DailyProductionReport" ADD COLUMN "outputLocationId" TEXT REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD COLUMN "locationId" TEXT REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReturnOrder" ADD COLUMN "locationId" TEXT REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "InventoryLocation" ("id", "code", "name", "note", "isDefault", "isActive")
VALUES ('default-location', 'DEFAULT', '默认库位', '系统迁移生成；未指定库位的历史库存与业务流水归入此库位。', true, true);

INSERT INTO "StockLocationBalance" ("id", "stockId", "locationId", "qty", "reservedQty", "availableQty")
SELECT 'default-location-balance-' || "id", "id", 'default-location', "qty", "reservedQty", "availableQty"
FROM "Stock";

UPDATE "StockLog" SET "locationId" = 'default-location' WHERE "locationId" IS NULL;
UPDATE "MaterialIn" SET "locationId" = 'default-location' WHERE "locationId" IS NULL;
UPDATE "DailyProductionReport"
SET "consumptionLocationId" = 'default-location', "outputLocationId" = 'default-location'
WHERE "consumptionLocationId" IS NULL OR "outputLocationId" IS NULL;
UPDATE "Shipment" SET "locationId" = 'default-location' WHERE "locationId" IS NULL;
UPDATE "ReturnOrder" SET "locationId" = 'default-location' WHERE "locationId" IS NULL;
