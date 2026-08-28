export { default } from './ui/StockPageModule'
export { default as StockMovementPageModule } from './ui/StockMovementPageModule'
export { default as DailyInventoryCountPage } from './ui/DailyInventoryCountPage'
export { default as InventoryLotTraceDialog } from './ui/InventoryLotTraceDialog'
export { default as InventoryLotPanoramaPageModule } from './ui/InventoryLotPanoramaPageModule'
export { default as WarehouseDigitalTwinPageModule } from './ui/WarehouseDigitalTwinPageModule'
export { loadInventoryLocations } from './client/stock-api'
export type { InventoryLocationOption } from './contracts/stock'
export { inventoryStatusLabel, inventoryStatuses } from './domain/inventory-status'
export type { InventoryStatus } from './domain/inventory-status'
export type { InventoryLotCustomerReturn, InventoryLotCustomerShipment, InventoryLotTrace, InventoryLotTraceNode, InventoryLotTraceRelation } from './contracts/inventory-lot-trace'
export type { InventoryLotPanorama, InventoryLotPanoramaEdge, InventoryLotPanoramaNode, InventoryLotSearchItem, InventoryLotSearchResult } from './contracts/inventory-lot-panorama'
export { getInventoryLotTrace } from './server/inventory-lot-trace-service'
export { getInventoryLotPanorama, searchInventoryLots } from './server/inventory-lot-panorama-service'
export { issueInventoryForBusinessReference } from './server/inventory-posting-service'
export { createInventoryReversalMovement, InventoryLedgerError } from '@/lib/inventory-ledger'
export type { InventoryReversalMovementInput } from '@/lib/inventory-ledger'
export {
  allocateAvailableInventoryLots,
  consumeAvailableInventoryLotsForReference,
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
