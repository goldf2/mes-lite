export { default } from './ui/StockPageModule'
export { default as StockMovementPageModule } from './ui/StockMovementPageModule'
export { default as DailyInventoryCountPage } from './ui/DailyInventoryCountPage'
export { default as InventoryLotTraceDialog } from './ui/InventoryLotTraceDialog'
export { default as InventoryLotPanoramaPageModule } from './ui/InventoryLotPanoramaPageModule'
export { default as WarehouseDigitalTwinPageModule } from './ui/WarehouseDigitalTwinPageModule'
export { getWarehousePackage, resolveWarehousePackage, warehousePackageScopeWhere } from './server/warehouse-package-query-service'
export { getOrCreateWarehousePackageLabel } from './server/warehouse-package-command-service'
export { WarehousePackageError, warehousePackageCode } from './domain/warehouse-package'
export { loadInventoryLocations } from './client/stock-api'
export type { InventoryLocationOption } from './contracts/stock'
export { inventoryStatusLabel, inventoryStatuses } from './domain/inventory-status'
export type { InventoryStatus } from './domain/inventory-status'
export type { InventoryLotCustomerReturn, InventoryLotCustomerShipment, InventoryLotTrace, InventoryLotTraceNode, InventoryLotTraceRelation } from './contracts/inventory-lot-trace'
export type { InventoryLotPanorama, InventoryLotPanoramaEdge, InventoryLotPanoramaNode, InventoryLotSearchItem, InventoryLotSearchResult } from './contracts/inventory-lot-panorama'
export { getInventoryLotTrace } from './server/inventory-lot-trace-service'
export { getInventoryLotPanorama, searchInventoryLots } from './server/inventory-lot-panorama-service'
export {
  assertInventoryIssueAvailability,
  changeStockLocationBalance,
  defaultInventoryLocationId,
  issueInventoryForBusinessReference,
  postInventoryIssue,
  postInventoryReceipt,
  resolveInventoryLocation,
  resolveReceiptQuantities,
  reverseInventoryIssue,
} from './server/inventory-posting-service'
export type { ConversionSource, InventoryReceiptStatus } from './server/inventory-posting-service'
export { postInventoryLocationTransfer } from './server/inventory-location-transfer-service'
export {
  recordShipmentStockShortage,
  reverseShipmentStockShortages,
  settleShipmentStockShortagesWithLot,
} from './server/shipment-stock-shortage-service'
export { createInventoryReversalMovement, InventoryLedgerError } from '@/lib/inventory-ledger'
export type { InventoryReversalMovementInput } from '@/lib/inventory-ledger'
export {
  allocateAvailableInventoryLots,
  consumeAvailableInventoryLotsForReference,
  restoreInventoryLotsForReference,
  allocateReturnToShipmentLots,
  allocateShipmentInventoryLots,
  reverseShipmentInventoryLots,
  createInventoryLotReceipt,
  createHistoricalShipmentLotAllocation,
  createProductionLotGenealogies,
  reverseProductionLotAllocations,
  scrapInventoryLotQuantity,
  transferAvailableInventoryLots,
  transitionInventoryLotStatus,
} from './server/inventory-status-service'

export { default as WarehousePackagePageModule } from './ui/WarehousePackagePageModule'
export { loadWarehousePackages, resolveWarehousePackage as resolveWarehousePackageCode, prepareWarehousePackageLabel } from './client/warehouse-package-api'
export type { WarehousePackage, WarehousePackageItem, WarehousePackageList, WarehousePackageLabelRevision, WarehousePackingOption, WarehousePackageForm } from './contracts/warehouse-package'
export { getPackedInventoryQuantity, listPackedInventoryItems } from './server/warehouse-package-stock-service'
