import { defineResourceSearchCatalog } from '@/lib/resource-search'
import type { Customer, InventoryLocationOption, Stock } from '../contracts/stock'
import type { StockMovement, StockMovementFilterOptions } from '../contracts/stock-movement'
import type { InventoryLotSearchItem } from '../contracts/inventory-lot-panorama'
import { materialCategoryFilterOptions, materialCategoryLabels } from './stock-view'
import { inventoryStatusLabel } from '../domain/inventory-status'

export const stockSearchFieldKeys = ['object', 'stockType', 'category', 'customerId', 'locationId', 'stockUnit', 'valuationUnit', 'qty', 'reservedQty', 'availableQty', 'quarantineQty', 'holdQty', 'reworkQty', 'valuationQty', 'availableValuationQty', 'totalCost', 'valuationUnitCost', 'stockUnitCost'] as const
export const stockMovementSearchFieldKeys = ['objectCode', 'objectName', 'objectSpec', 'objectKind', 'type', 'direction', 'locationId', 'qty', 'beforeQty', 'afterQty', 'valuationQty', 'costAmount', 'stockUnit', 'valuationUnit', 'refType', 'refId', 'operator', 'note', 'sourceMovementId', 'reversalMovementId', 'createdAt'] as const
export const inventoryLotSearchFieldKeys = ['lotNo', 'supplierLotNo', 'material', 'sourceType', 'sourceDocument', 'supplier', 'customer', 'location', 'inventoryStatus', 'stockQty', 'inspection', 'receivedAt'] as const

export const inventoryLotSearchCatalog = defineResourceSearchCatalog<InventoryLotSearchItem>('inventory-lot.actual-fields', [
  { key: 'lotNo', label: '内部批号', type: 'text', read: (item) => item.lot.lotNo },
  { key: 'supplierLotNo', label: '供应批号', type: 'text', read: (item) => item.lot.supplierLotNo },
  { key: 'material', label: '物料', type: 'text', read: (item) => [item.lot.material.code, item.lot.material.name, item.lot.material.stockUnit, item.lot.material.unit] },
  { key: 'sourceType', label: '来源类型', type: 'text', read: (item) => [item.lot.sourceType, item.lot.sourceDocument.type] },
  { key: 'sourceDocument', label: '来源单据', type: 'text', read: (item) => [item.lot.sourceId, item.lot.sourceDocument.number, item.lot.sourceDocument.productionOrder, item.lot.sourceDocument.actualNo, item.lot.sourceDocument.shipmentNo] },
  { key: 'supplier', label: '供应商', type: 'text', read: (item) => item.lot.sourceDocument.supplier },
  { key: 'customer', label: '客户', type: 'text', read: (item) => item.lot.sourceDocument.customer },
  { key: 'location', label: '当前库位', type: 'text', read: (item) => item.lot.balances.flatMap((entry) => [entry.location.code, entry.location.name]) },
  { key: 'inventoryStatus', label: '库存状态', type: 'select', read: (item) => item.lot.balances.flatMap((entry) => [entry.inventoryStatus, inventoryStatusLabel(entry.inventoryStatus)]), options: [{ value: 'AVAILABLE', label: '可用' }, { value: 'QUARANTINE', label: '待检' }, { value: 'HOLD', label: '冻结' }, { value: 'REWORK', label: '返工' }] },
  { key: 'stockQty', label: '库存数量', type: 'number', read: (item) => item.lot.balances.map((entry) => entry.stockQty) },
  { key: 'inspection', label: '质量检验', type: 'text', read: (item) => item.lot.inspections.flatMap((entry) => [entry.inspectionNo, entry.status, entry.result, entry.inspector, entry.note]) },
  { key: 'receivedAt', label: '入库日期', type: 'date', read: (item) => item.lot.receivedAt },
])

export function buildStockSearchCatalog(customers: readonly Customer[] = [], locations: readonly InventoryLocationOption[] = []) {
  return defineResourceSearchCatalog<Stock>('stock.actual-fields', [
    { key: 'object', label: '库存对象', type: 'text', read: (item) => [item.material?.code, item.material?.name, item.material?.spec, item.product?.sku, item.product?.name] },
    { key: 'stockType', label: '库存对象类型', type: 'select', read: (item) => item.material ? ['material', '物料库存'] : ['product', '成品库存'], options: [{ value: 'material', label: '物料库存' }, { value: 'product', label: '成品库存' }] },
    { key: 'category', label: '物料分类', type: 'select', read: (item) => [item.material?.category, item.material?.category ? materialCategoryLabels[item.material.category] : undefined, item.product?.category], options: materialCategoryFilterOptions },
    { key: 'customerId', label: '客户', type: 'select', read: (item) => [item.material?.customerId || item.product?.customerId || '__UNASSIGNED__', item.material?.customer?.code, item.material?.customer?.name, item.product?.customer?.code, item.product?.customer?.name], options: [{ value: '__UNASSIGNED__', label: '通用/未绑定' }, ...customers.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))] },
    { key: 'locationId', label: '库位', type: 'select', read: (item) => item.locationBalances.flatMap((balance) => [balance.locationId, balance.location.code, balance.location.name]), options: locations.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` })) },
    { key: 'stockUnit', label: '库存单位', type: 'text', read: (item) => item.material?.stockUnit || item.product?.unit },
    { key: 'valuationUnit', label: '计价单位', type: 'text', read: (item) => item.material?.valuationUnit || item.product?.unit },
    ...(['qty', 'reservedQty', 'availableQty', 'quarantineQty', 'holdQty', 'reworkQty', 'valuationQty', 'availableValuationQty', 'totalCost', 'valuationUnitCost', 'stockUnitCost'] as const).map((key) => ({ key, label: ({ qty: '库存数量', reservedQty: '预留数量', availableQty: '可用数量', quarantineQty: '待检数量', holdQty: '冻结数量', reworkQty: '返工数量', valuationQty: '计价数量', availableValuationQty: '可用计价数量', totalCost: '总成本', valuationUnitCost: '计价单位成本', stockUnitCost: '库存单位成本' })[key], type: 'number' as const, read: (item: Stock) => item[key] })),
  ])
}

export function buildStockMovementSearchCatalog(options: StockMovementFilterOptions) {
  return defineResourceSearchCatalog<StockMovement>('stock-movement.actual-fields', [
    { key: 'objectCode', label: '物料编码', type: 'text', read: (item) => item.object.code },
    { key: 'objectName', label: '物料名称', type: 'text', read: (item) => item.object.name },
    { key: 'objectSpec', label: '规格', type: 'text', read: (item) => item.object.spec },
    { key: 'objectKind', label: '对象类型', type: 'select', read: (item) => item.object.kind, options: [{ value: 'material', label: '物料' }, { value: 'product', label: '成品' }] },
    { key: 'type', label: '流水类型', type: 'select', read: (item) => item.type, options: options.types },
    { key: 'direction', label: '收发方向', type: 'select', read: (item) => item.qty > 0 ? ['in', '增加库存'] : item.qty < 0 ? ['out', '减少库存'] : null, options: [{ value: 'in', label: '增加库存' }, { value: 'out', label: '减少库存' }] },
    { key: 'locationId', label: '库位', type: 'select', read: (item) => [item.location?.id, item.location?.code, item.location?.name], options: options.locations },
    ...(['qty', 'beforeQty', 'afterQty', 'valuationQty', 'costAmount'] as const).map((key) => ({ key, label: ({ qty: '变动数量', beforeQty: '变动前数量', afterQty: '变动后数量', valuationQty: '计价变动数量', costAmount: '成本变动' })[key], type: 'number' as const, read: (item: StockMovement) => item[key] })),
    { key: 'stockUnit', label: '库存单位', type: 'text', read: (item) => item.stockUnit },
    { key: 'valuationUnit', label: '计价单位', type: 'text', read: (item) => item.valuationUnit },
    { key: 'refType', label: '来源类型', type: 'select', read: (item) => item.refType, options: options.refTypes },
    { key: 'refId', label: '来源单据 ID', type: 'text', read: (item) => item.refId },
    { key: 'operator', label: '操作人', type: 'text', read: (item) => item.createdBy },
    { key: 'note', label: '备注', type: 'text', read: (item) => item.note },
    { key: 'sourceMovementId', label: '原流水 ID', type: 'text', read: (item) => item.sourceMovementId },
    { key: 'reversalMovementId', label: '冲销流水 ID', type: 'text', read: (item) => item.reversalMovementId },
    { key: 'createdAt', label: '发生日期', type: 'date', read: (item) => item.createdAt },
  ])
}
