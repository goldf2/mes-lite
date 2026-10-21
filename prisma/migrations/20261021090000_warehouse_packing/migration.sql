-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originNote" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WarehouseLayoutVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "warehouseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "measuredAt" DATETIME,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WarehouseLayoutVersion_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WarehouseSpatialNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "layoutVersionId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "xMm" INTEGER NOT NULL DEFAULT 0,
    "yMm" INTEGER NOT NULL DEFAULT 0,
    "zMm" INTEGER NOT NULL DEFAULT 0,
    "lengthMm" INTEGER NOT NULL,
    "widthMm" INTEGER NOT NULL,
    "heightMm" INTEGER NOT NULL,
    "yawDeg" REAL NOT NULL DEFAULT 0,
    "locationId" TEXT,
    "maxWeightKg" REAL,
    CONSTRAINT "WarehouseSpatialNode_layoutVersionId_fkey" FOREIGN KEY ("layoutVersionId") REFERENCES "WarehouseLayoutVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WarehouseSpatialNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WarehouseSpatialNode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WarehouseSpatialNode_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GoodsPlacement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packageDocumentId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "xMm" INTEGER,
    "yMm" INTEGER,
    "zMm" INTEGER,
    "yawDeg" REAL NOT NULL DEFAULT 0,
    "precision" TEXT NOT NULL DEFAULT 'LOCATION_ONLY',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "confirmedBy" TEXT,
    "confirmedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GoodsPlacement_packageDocumentId_fkey" FOREIGN KEY ("packageDocumentId") REFERENCES "PackageDocument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GoodsPlacement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GoodsMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packageDocumentId" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "flowTransferId" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "operatedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoodsMovement_packageDocumentId_fkey" FOREIGN KEY ("packageDocumentId") REFERENCES "PackageDocument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PackageLabelRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packageDocumentId" TEXT NOT NULL,
    "contentVersion" INTEGER NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PackageLabelRevision_packageDocumentId_fkey" FOREIGN KEY ("packageDocumentId") REFERENCES "PackageDocument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShipmentPackageAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "packageDocumentId" TEXT NOT NULL,
    "contentVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "reservedBy" TEXT NOT NULL,
    "reservedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" DATETIME,
    CONSTRAINT "ShipmentPackageAllocation_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShipmentPackageAllocation_packageDocumentId_fkey" FOREIGN KEY ("packageDocumentId") REFERENCES "PackageDocument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShipmentItemSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentItemId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "allocationId" TEXT,
    "packageDocumentItemId" TEXT,
    "inventoryLotId" TEXT,
    "locationId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShipmentItemSource_shipmentItemId_fkey" FOREIGN KEY ("shipmentItemId") REFERENCES "ShipmentItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShipmentItemSource_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "ShipmentPackageAllocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShipmentItemSource_packageDocumentItemId_fkey" FOREIGN KEY ("packageDocumentItemId") REFERENCES "PackageDocumentItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShipmentItemSource_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "InventoryLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShipmentItemSource_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InventoryLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" DATETIME,
    "warehouseId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryLocation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_InventoryLocation" ("code", "createdAt", "deletedAt", "id", "isActive", "isDefault", "name", "note", "sortOrder", "updatedAt") SELECT "code", "createdAt", "deletedAt", "id", "isActive", "isDefault", "name", "note", "sortOrder", "updatedAt" FROM "InventoryLocation";
DROP TABLE "InventoryLocation";
ALTER TABLE "new_InventoryLocation" RENAME TO "InventoryLocation";
CREATE UNIQUE INDEX "InventoryLocation_code_key" ON "InventoryLocation"("code");
CREATE INDEX "InventoryLocation_sortOrder_idx" ON "InventoryLocation"("sortOrder");
CREATE TABLE "new_PackageDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packageNo" TEXT NOT NULL,
    "shipmentId" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'SHIPMENT',
    "packagingType" TEXT NOT NULL DEFAULT 'CARTON',
    "contentVersion" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "productionPersonnel" TEXT,
    "qualityPersonnel" TEXT,
    "productionDate" DATETIME,
    "personnelSource" TEXT NOT NULL DEFAULT 'UNRECORDED',
    "clientRequestId" TEXT,
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
INSERT INTO "new_PackageDocument" ("createdAt", "deletedAt", "deletedBy", "grossWeight", "heightMm", "id", "lengthMm", "netWeight", "note", "packageNo", "packedAt", "packedBy", "sealNo", "shipmentId", "status", "updatedAt", "weightUnit", "widthMm") SELECT "createdAt", "deletedAt", "deletedBy", "grossWeight", "heightMm", "id", "lengthMm", "netWeight", "note", "packageNo", "packedAt", "packedBy", "sealNo", "shipmentId", "status", "updatedAt", "weightUnit", "widthMm" FROM "PackageDocument";
DROP TABLE "PackageDocument";
ALTER TABLE "new_PackageDocument" RENAME TO "PackageDocument";
CREATE UNIQUE INDEX "PackageDocument_packageNo_key" ON "PackageDocument"("packageNo");
CREATE UNIQUE INDEX "PackageDocument_clientRequestId_key" ON "PackageDocument"("clientRequestId");
CREATE INDEX "PackageDocument_sourceType_status_deletedAt_idx" ON "PackageDocument"("sourceType", "status", "deletedAt");
CREATE INDEX "PackageDocument_shipmentId_status_idx" ON "PackageDocument"("shipmentId", "status");
CREATE INDEX "PackageDocument_packedAt_idx" ON "PackageDocument"("packedAt");
CREATE TABLE "new_PackageDocumentItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packageDocumentId" TEXT NOT NULL,
    "shipmentItemId" TEXT,
    "inventoryStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
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
INSERT INTO "new_PackageDocumentItem" ("createdAt", "id", "inventoryLotId", "lotNoSnapshot", "materialId", "note", "packageDocumentId", "quantity", "shipmentItemId", "unitSnapshot") SELECT "createdAt", "id", "inventoryLotId", "lotNoSnapshot", "materialId", "note", "packageDocumentId", "quantity", "shipmentItemId", "unitSnapshot" FROM "PackageDocumentItem";
DROP TABLE "PackageDocumentItem";
ALTER TABLE "new_PackageDocumentItem" RENAME TO "PackageDocumentItem";
CREATE INDEX "PackageDocumentItem_packageDocumentId_idx" ON "PackageDocumentItem"("packageDocumentId");
CREATE INDEX "PackageDocumentItem_shipmentItemId_idx" ON "PackageDocumentItem"("shipmentItemId");
CREATE INDEX "PackageDocumentItem_materialId_idx" ON "PackageDocumentItem"("materialId");
CREATE INDEX "PackageDocumentItem_inventoryLotId_idx" ON "PackageDocumentItem"("inventoryLotId");
CREATE TABLE "new_LabelPrintJob" (
    "labelRevisionId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobNo" TEXT NOT NULL,
    "clientRequestId" TEXT,
    "templateType" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "printerModel" TEXT NOT NULL,
    "printerDpi" INTEGER NOT NULL,
    "printerIp" TEXT,
    "labelWidthMm" REAL NOT NULL,
    "labelHeightMm" REAL NOT NULL,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "payloadJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requestedBy" TEXT,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LabelPrintJob_labelRevisionId_fkey" FOREIGN KEY ("labelRevisionId") REFERENCES "PackageLabelRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_LabelPrintJob" ("clientRequestId", "copies", "id", "jobNo", "labelHeightMm", "labelWidthMm", "payloadJson", "printerDpi", "printerIp", "printerModel", "referenceId", "referenceType", "requestedAt", "requestedBy", "status", "templateType") SELECT "clientRequestId", "copies", "id", "jobNo", "labelHeightMm", "labelWidthMm", "payloadJson", "printerDpi", "printerIp", "printerModel", "referenceId", "referenceType", "requestedAt", "requestedBy", "status", "templateType" FROM "LabelPrintJob";
DROP TABLE "LabelPrintJob";
ALTER TABLE "new_LabelPrintJob" RENAME TO "LabelPrintJob";
CREATE UNIQUE INDEX "LabelPrintJob_jobNo_key" ON "LabelPrintJob"("jobNo");
CREATE UNIQUE INDEX "LabelPrintJob_clientRequestId_key" ON "LabelPrintJob"("clientRequestId");
CREATE INDEX "LabelPrintJob_referenceType_referenceId_requestedAt_idx" ON "LabelPrintJob"("referenceType", "referenceId", "requestedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE INDEX "WarehouseLayoutVersion_warehouseId_status_idx" ON "WarehouseLayoutVersion"("warehouseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseLayoutVersion_warehouseId_version_key" ON "WarehouseLayoutVersion"("warehouseId", "version");

-- CreateIndex
CREATE INDEX "WarehouseSpatialNode_parentId_idx" ON "WarehouseSpatialNode"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseSpatialNode_layoutVersionId_stableKey_key" ON "WarehouseSpatialNode"("layoutVersionId", "stableKey");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseSpatialNode_layoutVersionId_locationId_key" ON "WarehouseSpatialNode"("layoutVersionId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsPlacement_packageDocumentId_key" ON "GoodsPlacement"("packageDocumentId");

-- CreateIndex
CREATE INDEX "GoodsPlacement_locationId_idx" ON "GoodsPlacement"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsMovement_clientRequestId_key" ON "GoodsMovement"("clientRequestId");

-- CreateIndex
CREATE INDEX "GoodsMovement_packageDocumentId_createdAt_idx" ON "GoodsMovement"("packageDocumentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PackageLabelRevision_packageDocumentId_contentVersion_templateVersion_key" ON "PackageLabelRevision"("packageDocumentId", "contentVersion", "templateVersion");

-- CreateIndex
CREATE INDEX "ShipmentPackageAllocation_packageDocumentId_status_idx" ON "ShipmentPackageAllocation"("packageDocumentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentPackageAllocation_shipmentId_packageDocumentId_key" ON "ShipmentPackageAllocation"("shipmentId", "packageDocumentId");

-- CreateIndex
CREATE INDEX "ShipmentItemSource_shipmentItemId_idx" ON "ShipmentItemSource"("shipmentItemId");

-- CreateIndex
CREATE INDEX "ShipmentItemSource_allocationId_idx" ON "ShipmentItemSource"("allocationId");

-- CreateIndex
CREATE INDEX "ShipmentItemSource_inventoryLotId_idx" ON "ShipmentItemSource"("inventoryLotId");

-- At most one live shipment may claim an unchanged physical load.
CREATE UNIQUE INDEX "ShipmentPackageAllocation_one_live_claim"
ON "ShipmentPackageAllocation"("packageDocumentId") WHERE "status" = 'RESERVED';
CREATE UNIQUE INDEX "WarehouseLayoutVersion_one_published"
ON "WarehouseLayoutVersion"("warehouseId") WHERE "status" = 'PUBLISHED';

-- A sealed label is a historical print snapshot, including source provenance.
CREATE TRIGGER "PackageLabelRevision_immutable_update"
BEFORE UPDATE ON "PackageLabelRevision" BEGIN
  SELECT RAISE(ABORT, '装箱标签版本不可修改，请生成新版本');
END;
CREATE TRIGGER "PackageLabelRevision_immutable_delete"
BEFORE DELETE ON "PackageLabelRevision" BEGIN
  SELECT RAISE(ABORT, '装箱标签历史不可删除');
END;
CREATE TRIGGER "PackageDocumentItem_warehouse_identity_insert"
BEFORE INSERT ON "PackageDocumentItem"
WHEN EXISTS (SELECT 1 FROM "PackageDocument" p WHERE p.id=NEW.packageDocumentId AND p.sourceType='WAREHOUSE')
BEGIN
  SELECT CASE WHEN NEW.quantity <= 0 OR NEW.inventoryLotId IS NULL OR NOT EXISTS
    (SELECT 1 FROM "InventoryLot" l WHERE l.id=NEW.inventoryLotId AND l.materialId=NEW.materialId)
    THEN RAISE(ABORT, '仓库装箱必须绑定真实物料批次和正数数量') END;
END;
CREATE TRIGGER "PackageDocumentItem_sealed_content_update"
BEFORE UPDATE ON "PackageDocumentItem"
WHEN EXISTS (SELECT 1 FROM "PackageDocument" p WHERE p.id=OLD.packageDocumentId AND p.sourceType='WAREHOUSE')
AND (NEW.quantity != OLD.quantity OR NEW.materialId != OLD.materialId OR NEW.inventoryLotId IS NOT OLD.inventoryLotId
  OR NEW.packageDocumentId != OLD.packageDocumentId OR NEW.unitSnapshot != OLD.unitSnapshot)
BEGIN SELECT RAISE(ABORT, '装箱内容不可覆盖，请作废后重新装箱'); END;
