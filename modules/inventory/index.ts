export { default } from './ui/StockPageModule'
export { default as StockMovementPageModule } from './ui/StockMovementPageModule'
export { default as InventoryLotTraceDialog } from './ui/InventoryLotTraceDialog'
export { inventoryStatusLabel, inventoryStatuses } from './domain/inventory-status'
export type { InventoryStatus } from './domain/inventory-status'
export type { InventoryLotCustomerReturn, InventoryLotCustomerShipment, InventoryLotTrace, InventoryLotTraceNode, InventoryLotTraceRelation } from './contracts/inventory-lot-trace'
export { getInventoryLotTrace } from './server/inventory-lot-trace-service'
export {
  allocateAvailableInventoryLots,
  allocateReturnToShipmentLots,
  allocateShipmentInventoryLots,
  createInventoryLotReceipt,
  createHistoricalShipmentLotAllocation,
  createProductionLotGenealogies,
  reverseProductionLotAllocations,
  scrapInventoryLotQuantity,
  transferAvailableInventoryLots,
  transitionInventoryLotStatus,
} from './server/inventory-status-service'
