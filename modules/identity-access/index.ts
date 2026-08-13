export { default as OperatorPageModule } from './ui/OperatorPageModule'
export { default as PermissionPageModule } from './ui/PermissionPageModule'
export type { PermissionActor } from './contracts/permission-admin'
export {
  DataScopeError,
  inventoryDataScopeModes,
  productionDataScopeModes,
  unrestrictedDataScope,
} from './domain/data-scope'
export type {
  DataScopeActor,
  EffectiveDataScope,
  InventoryDataScopeMode,
  ProductionDataScopeMode,
} from './domain/data-scope'
export {
  allowedInventoryLocationIds,
  assertDispatchDataScope,
  assertInventoryLotDataScope,
  assertInventoryLocationDataScope,
  assertProductionActualDataScope,
  assertProductionAssignmentDataScope,
  assertProductionOrderIdDataScope,
  assertUnrestrictedInventoryDataScope,
  dispatchDataScopeWhere,
  flowTransferDataScopeWhere,
  loadEffectiveDataScope,
  productionOrderDataScopeWhere,
  productionActualDataScopeWhere,
  materialInDataScopeWhere,
  materialReceiptDataScopeWhere,
  shipmentDataScopeWhere,
  returnDataScopeWhere,
  stockLogDataScopeWhere,
  qualityInspectionDataScopeWhere,
  inventoryLotDataScopeWhere,
  assertProductionOrderDataScope,
  stockDataScopeWhere,
  workReportDataScopeWhere,
} from './server/data-scope-service'
