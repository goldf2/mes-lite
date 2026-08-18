-- CreateTable
CREATE TABLE "PackageDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packageNo" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PACKED',
    "packedBy" TEXT NOT NULL,
    "packedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grossWeight" REAL,
    "netWeight" REAL,
    "weightUnit" TEXT NOT NULL DEFAULT 'kg',
    "lengthMm" REAL,
    "widthMm" REAL,
    "heightMm" REAL,
    "sealNo" TEXT,
    "note" TEXT,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PackageDocument_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PackageDocumentItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packageDocumentId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "inventoryLotId" TEXT,
    "quantity" REAL NOT NULL,
    "unitSnapshot" TEXT NOT NULL,
    "lotNoSnapshot" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PackageDocumentItem_packageDocumentId_fkey" FOREIGN KEY ("packageDocumentId") REFERENCES "PackageDocument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PackageDocumentItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PackageDocumentItem_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "InventoryLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PackageDocument_packageNo_key" ON "PackageDocument"("packageNo");

-- CreateIndex
CREATE INDEX "PackageDocument_shipmentId_status_idx" ON "PackageDocument"("shipmentId", "status");

-- CreateIndex
CREATE INDEX "PackageDocument_packedAt_idx" ON "PackageDocument"("packedAt");

-- CreateIndex
CREATE INDEX "PackageDocumentItem_packageDocumentId_idx" ON "PackageDocumentItem"("packageDocumentId");

-- CreateIndex
CREATE INDEX "PackageDocumentItem_materialId_idx" ON "PackageDocumentItem"("materialId");

-- CreateIndex
CREATE INDEX "PackageDocumentItem_inventoryLotId_idx" ON "PackageDocumentItem"("inventoryLotId");
