PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Historical single-line shipments can only be promoted when their required
-- material and location can be resolved. Failing here avoids silent data loss.
CREATE TEMP TABLE "_ShipmentItemMigrationGuard" (
    "unresolvedCount" INTEGER NOT NULL CHECK ("unresolvedCount" = 0)
);
INSERT INTO "_ShipmentItemMigrationGuard" ("unresolvedCount")
SELECT COUNT(*)
FROM "Shipment" AS s
LEFT JOIN "Product" AS p ON p."id" = s."productId"
WHERE COALESCE(s."materialId", p."materialId") IS NULL
   OR s."locationId" IS NULL;
INSERT INTO "_ShipmentItemMigrationGuard" ("unresolvedCount")
SELECT COUNT(*) FROM "ReturnOrder" WHERE "shipmentId" IS NULL;

CREATE TABLE "ShipmentItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "materialId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "qty" REAL NOT NULL,
    "unitSnapshot" TEXT NOT NULL,
    "unitPrice" REAL NOT NULL DEFAULT 0,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "shippedValuationQty" REAL NOT NULL DEFAULT 0,
    "shippedCostAmount" REAL NOT NULL DEFAULT 0,
    "stockUnitSnapshot" TEXT,
    "valuationUnitSnapshot" TEXT,
    "conversionRateUsed" REAL,
    "conversionSource" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShipmentItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShipmentItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "ShipmentItem" (
    "id", "shipmentId", "sortOrder", "materialId",
    "locationId", "qty", "unitSnapshot", "unitPrice", "totalAmount",
    "shippedValuationQty", "shippedCostAmount", "stockUnitSnapshot",
    "valuationUnitSnapshot", "conversionRateUsed", "conversionSource", "createdAt", "updatedAt"
)
SELECT
    'shipment-item-' || s."id",
    s."id",
    0,
    COALESCE(s."materialId", p."materialId"),
    s."locationId",
    s."qty",
    COALESCE(s."stockUnitSnapshot", m."stockUnit", p."unit", m."unit", '件'),
    s."unitPrice",
    s."totalAmount",
    s."shippedValuationQty",
    s."shippedCostAmount",
    s."stockUnitSnapshot",
    s."valuationUnitSnapshot",
    s."conversionRateUsed",
    s."conversionSource",
    s."createdAt",
    COALESCE(s."shippedAt", s."createdAt", CURRENT_TIMESTAMP)
FROM "Shipment" AS s
LEFT JOIN "Product" AS p ON p."id" = s."productId"
LEFT JOIN "Material" AS m ON m."id" = COALESCE(s."materialId", p."materialId");

CREATE TABLE "new_PackageDocumentItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packageDocumentId" TEXT NOT NULL,
    "shipmentItemId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "inventoryLotId" TEXT,
    "quantity" REAL NOT NULL,
    "unitSnapshot" TEXT NOT NULL,
    "lotNoSnapshot" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PackageDocumentItem_packageDocumentId_fkey" FOREIGN KEY ("packageDocumentId") REFERENCES "PackageDocument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PackageDocumentItem_shipmentItemId_fkey" FOREIGN KEY ("shipmentItemId") REFERENCES "ShipmentItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PackageDocumentItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PackageDocumentItem_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "InventoryLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PackageDocumentItem" (
    "id", "packageDocumentId", "shipmentItemId", "materialId", "inventoryLotId",
    "quantity", "unitSnapshot", "lotNoSnapshot", "note", "createdAt"
)
SELECT
    i."id", i."packageDocumentId", 'shipment-item-' || p."shipmentId", i."materialId",
    i."inventoryLotId", i."quantity", i."unitSnapshot", i."lotNoSnapshot", i."note", i."createdAt"
FROM "PackageDocumentItem" AS i
JOIN "PackageDocument" AS p ON p."id" = i."packageDocumentId";
DROP TABLE "PackageDocumentItem";
ALTER TABLE "new_PackageDocumentItem" RENAME TO "PackageDocumentItem";
CREATE INDEX "PackageDocumentItem_packageDocumentId_idx" ON "PackageDocumentItem"("packageDocumentId");
CREATE INDEX "PackageDocumentItem_shipmentItemId_idx" ON "PackageDocumentItem"("shipmentItemId");
CREATE INDEX "PackageDocumentItem_materialId_idx" ON "PackageDocumentItem"("materialId");
CREATE INDEX "PackageDocumentItem_inventoryLotId_idx" ON "PackageDocumentItem"("inventoryLotId");

CREATE TABLE "new_ReturnOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "returnNo" TEXT NOT NULL,
    "voucherNo" TEXT,
    "shipmentId" TEXT NOT NULL,
    "shipmentItemId" TEXT NOT NULL,
    "productId" TEXT,
    "materialId" TEXT,
    "locationId" TEXT,
    "qty" REAL NOT NULL,
    "processedValuationQty" REAL NOT NULL DEFAULT 0,
    "processedCostAmount" REAL NOT NULL DEFAULT 0,
    "stockUnitSnapshot" TEXT,
    "valuationUnitSnapshot" TEXT,
    "conversionRateUsed" REAL,
    "conversionSource" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "processedAt" DATETIME,
    "processedBy" TEXT,
    "note" TEXT,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReturnOrder_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReturnOrder_shipmentItemId_fkey" FOREIGN KEY ("shipmentItemId") REFERENCES "ShipmentItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReturnOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReturnOrder_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReturnOrder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ReturnOrder" (
    "id", "returnNo", "voucherNo", "shipmentId", "shipmentItemId", "productId",
    "materialId", "locationId", "qty", "processedValuationQty", "processedCostAmount",
    "stockUnitSnapshot", "valuationUnitSnapshot", "conversionRateUsed", "conversionSource",
    "reason", "status", "processedAt", "processedBy", "note", "deletedAt", "deletedBy", "createdAt"
)
SELECT
    "id", "returnNo", "voucherNo", "shipmentId", 'shipment-item-' || "shipmentId", "productId",
    "materialId", "locationId", "qty", "processedValuationQty", "processedCostAmount",
    "stockUnitSnapshot", "valuationUnitSnapshot", "conversionRateUsed", "conversionSource",
    "reason", "status", "processedAt", "processedBy", "note", "deletedAt", "deletedBy", "createdAt"
FROM "ReturnOrder";
DROP TABLE "ReturnOrder";
ALTER TABLE "new_ReturnOrder" RENAME TO "ReturnOrder";
CREATE UNIQUE INDEX "ReturnOrder_returnNo_key" ON "ReturnOrder"("returnNo");
CREATE INDEX "ReturnOrder_materialId_idx" ON "ReturnOrder"("materialId");
CREATE INDEX "ReturnOrder_shipmentItemId_idx" ON "ReturnOrder"("shipmentItemId");

CREATE TABLE "new_ShipmentLotAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "shipmentItemId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "inventoryStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "stockQty" REAL NOT NULL,
    "valuationQty" REAL NOT NULL DEFAULT 0,
    "costAmount" REAL NOT NULL DEFAULT 0,
    "returnedStockQty" REAL NOT NULL DEFAULT 0,
    "returnedValuationQty" REAL NOT NULL DEFAULT 0,
    "returnedCostAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShipmentLotAllocation_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShipmentLotAllocation_shipmentItemId_fkey" FOREIGN KEY ("shipmentItemId") REFERENCES "ShipmentItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShipmentLotAllocation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShipmentLotAllocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ShipmentLotAllocation" (
    "id", "shipmentId", "shipmentItemId", "lotId", "locationId", "inventoryStatus",
    "stockQty", "valuationQty", "costAmount", "returnedStockQty",
    "returnedValuationQty", "returnedCostAmount", "status", "createdAt"
)
SELECT
    "id", "shipmentId", 'shipment-item-' || "shipmentId", "lotId", "locationId", "inventoryStatus",
    "stockQty", "valuationQty", "costAmount", "returnedStockQty",
    "returnedValuationQty", "returnedCostAmount", "status", "createdAt"
FROM "ShipmentLotAllocation";
DROP TABLE "ShipmentLotAllocation";
ALTER TABLE "new_ShipmentLotAllocation" RENAME TO "ShipmentLotAllocation";
CREATE INDEX "ShipmentLotAllocation_shipmentId_status_idx" ON "ShipmentLotAllocation"("shipmentId", "status");
CREATE INDEX "ShipmentLotAllocation_shipmentItemId_status_idx" ON "ShipmentLotAllocation"("shipmentItemId", "status");
CREATE INDEX "ShipmentLotAllocation_lotId_status_idx" ON "ShipmentLotAllocation"("lotId", "status");
CREATE INDEX "ShipmentLotAllocation_locationId_status_idx" ON "ShipmentLotAllocation"("locationId", "status");
CREATE UNIQUE INDEX "ShipmentLotAllocation_shipmentItemId_lotId_locationId_key" ON "ShipmentLotAllocation"("shipmentItemId", "lotId", "locationId");

CREATE TABLE "new_Shipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentNo" TEXT NOT NULL,
    "voucherNo" TEXT,
    "productId" TEXT,
    "materialId" TEXT,
    "locationId" TEXT,
    "customerId" TEXT,
    "qty" REAL NOT NULL DEFAULT 0,
    "unitPrice" REAL NOT NULL DEFAULT 0,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "customer" TEXT NOT NULL,
    "customerPhone" TEXT,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "shippedAt" DATETIME,
    "shippedBy" TEXT,
    "lotTraceStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "shippedValuationQty" REAL NOT NULL DEFAULT 0,
    "shippedCostAmount" REAL NOT NULL DEFAULT 0,
    "stockUnitSnapshot" TEXT,
    "valuationUnitSnapshot" TEXT,
    "conversionRateUsed" REAL,
    "conversionSource" TEXT,
    "trackingNo" TEXT,
    "note" TEXT,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shipment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Shipment_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Shipment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Shipment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Shipment" (
    "id", "shipmentNo", "voucherNo", "productId", "materialId", "locationId", "customerId",
    "qty", "unitPrice", "totalAmount", "customer",
    "customerPhone", "address", "status", "shippedAt", "shippedBy", "lotTraceStatus",
    "shippedValuationQty", "shippedCostAmount", "stockUnitSnapshot", "valuationUnitSnapshot",
    "conversionRateUsed", "conversionSource", "trackingNo", "note", "deletedAt", "deletedBy",
    "createdAt", "updatedAt"
)
SELECT
    "id", "shipmentNo", "voucherNo", "productId", "materialId", "locationId", "customerId",
    "qty", "unitPrice", "totalAmount", "customer",
    "customerPhone", "address", "status", "shippedAt", "shippedBy", "lotTraceStatus",
    "shippedValuationQty", "shippedCostAmount", "stockUnitSnapshot", "valuationUnitSnapshot",
    "conversionRateUsed", "conversionSource", "trackingNo", "note", "deletedAt", "deletedBy",
    "createdAt", COALESCE("shippedAt", "createdAt", CURRENT_TIMESTAMP)
FROM "Shipment";
DROP TABLE "Shipment";
ALTER TABLE "new_Shipment" RENAME TO "Shipment";
CREATE UNIQUE INDEX "Shipment_shipmentNo_key" ON "Shipment"("shipmentNo");
CREATE INDEX "Shipment_materialId_idx" ON "Shipment"("materialId");

CREATE INDEX "ShipmentItem_shipmentId_sortOrder_idx" ON "ShipmentItem"("shipmentId", "sortOrder");
CREATE INDEX "ShipmentItem_materialId_idx" ON "ShipmentItem"("materialId");
CREATE INDEX "ShipmentItem_locationId_idx" ON "ShipmentItem"("locationId");

DROP TABLE "_ShipmentItemMigrationGuard";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
