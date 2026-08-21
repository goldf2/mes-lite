import { defineResourceSearchCatalog } from '@/lib/resource-search'
import type { CustomerOption, InventoryLocationOption, MaterialInRecord, SupplierOption } from '../contracts/material-in'
import { materialInStatusLabels, materialInStatusOptions } from './material-in-view'

export const materialInSearchFieldKeys = [
  'inboundNo', 'voucherNo', 'status', 'supplierId', 'customerId', 'material', 'batchNo',
  'locationId', 'receivedBy', 'note', 'totalAmount', 'itemCount', 'inboundDate',
] as const

export function buildMaterialInSearchCatalog({
  customers,
  suppliers,
  locations,
}: {
  customers: readonly CustomerOption[]
  suppliers: readonly SupplierOption[]
  locations: readonly InventoryLocationOption[]
}) {
  return defineResourceSearchCatalog<MaterialInRecord>('material-in.actual-fields', [
    { key: 'inboundNo', label: '来料单号', type: 'text', read: (item) => item.inboundNo },
    { key: 'voucherNo', label: '凭据号', type: 'text', read: (item) => item.voucherNo },
    { key: 'status', label: '状态', type: 'select', read: (item) => [item.status, materialInStatusLabels[item.status]], options: materialInStatusOptions },
    { key: 'supplierId', label: '供应商', type: 'select', read: (item) => [item.supplierId, item.supplier.code, item.supplier.name], options: suppliers.map((supplier) => ({ value: supplier.id, label: `${supplier.code} · ${supplier.name}` })) },
    { key: 'customerId', label: '归属客户', type: 'select', read: (item) => item.items.flatMap((line) => [line.material.customerId || '__UNASSIGNED__', line.material.customer?.code, line.material.customer?.name]), options: [{ value: '__UNASSIGNED__', label: '通用/未绑定' }, ...customers.map((customer) => ({ value: customer.id, label: `${customer.code} · ${customer.name}` }))] },
    { key: 'material', label: '物料', type: 'text', read: (item) => item.items.flatMap((line) => [line.material.code, line.material.name, line.material.spec]) },
    { key: 'batchNo', label: '批次号', type: 'text', read: (item) => item.items.map((line) => line.batchNo) },
    { key: 'locationId', label: '待分库库位', type: 'select', read: (item) => [item.locationId, item.location.code, item.location.name], options: locations.map((location) => ({ value: location.id, label: `${location.code} · ${location.name}` })) },
    { key: 'receivedBy', label: '收货人', type: 'text', read: (item) => item.receivedBy },
    { key: 'note', label: '备注', type: 'text', read: (item) => item.note },
    { key: 'totalAmount', label: '总金额', type: 'number', read: (item) => item.totalAmount },
    { key: 'itemCount', label: '物料项数', type: 'number', read: (item) => item.itemCount },
    { key: 'inboundDate', label: '来料日期', type: 'date', read: (item) => item.inboundDate },
  ])
}
