ALTER TABLE "Shipment" ADD COLUMN "deliveredAt" DATETIME;
ALTER TABLE "Shipment" ADD COLUMN "deliveredBy" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "cancelledAt" DATETIME;
ALTER TABLE "Shipment" ADD COLUMN "cancelledBy" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "reversedAt" DATETIME;
ALTER TABLE "Shipment" ADD COLUMN "reversedBy" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "reverseReason" TEXT;

ALTER TABLE "ShipmentItem" ADD COLUMN "costLayerSnapshot" TEXT;

ALTER TABLE "ShipmentLotAllocation" ADD COLUMN "reversedAt" DATETIME;
ALTER TABLE "ShipmentLotAllocation" ADD COLUMN "reversedBy" TEXT;
ALTER TABLE "ShipmentLotAllocation" ADD COLUMN "reverseReason" TEXT;
