import { defineResourceSearchCatalog } from '@/lib/resource-search'
import type { FulfillmentCustomer, InventoryLocationOption, ReturnOrder, Shipment } from '../contracts/fulfillment'
import type { SalesCustomerOption, SalesOrder } from '../contracts/sales-order'
import { returnStatusLabels, returnStatusOptions, shipmentStatusLabels, shipmentStatusOptions } from './fulfillment-view'
import { salesOrderStatusMeta, salesOrderStatusOptions } from './sales-order-view'

export const salesOrderSearchFieldKeys = ['orderNo', 'voucherNo', 'status', 'customerId', 'material', 'orderDate', 'deliveryDate', 'totalAmount', 'currency', 'note', 'itemCount', 'shipmentCount'] as const
export const shipmentSearchFieldKeys = ['shipmentNo', 'voucherNo', 'status', 'customerId', 'product', 'locationId', 'qty', 'unitPrice', 'totalAmount', 'customer', 'customerPhone', 'address', 'trackingNo', 'shippedBy', 'note', 'salesOrder', 'lotNo', 'shippedAt', 'createdAt'] as const
export const returnSearchFieldKeys = ['returnNo', 'voucherNo', 'status', 'customerId', 'product', 'shipmentNo', 'locationId', 'qty', 'reason', 'note', 'lotNo', 'createdAt', 'processedAt'] as const

export function buildSalesOrderSearchCatalog(customers: readonly SalesCustomerOption[]) {
  return defineResourceSearchCatalog<SalesOrder>('sales-order.actual-fields', [
    { key: 'orderNo', label: '销售订单号', type: 'text', read: (item) => item.orderNo },
    { key: 'voucherNo', label: '凭据号', type: 'text', read: (item) => item.voucherNo },
    { key: 'status', label: '状态', type: 'select', read: (item) => [item.status, salesOrderStatusMeta[item.status]?.label], options: salesOrderStatusOptions },
    { key: 'customerId', label: '客户', type: 'select', read: (item) => [item.customer.id, item.customer.code, item.customer.name], options: customers.map((customer) => ({ value: customer.id, label: `${customer.code} · ${customer.name}` })) },
    { key: 'material', label: '订单物料', type: 'text', read: (item) => item.items.flatMap((line) => [line.material.code, line.material.name, line.material.spec]) },
    { key: 'orderDate', label: '订单日期', type: 'date', read: (item) => item.orderDate },
    { key: 'deliveryDate', label: '交付日期', type: 'date', read: (item) => item.deliveryDate },
    { key: 'totalAmount', label: '订单总额', type: 'number', read: (item) => item.totalAmount },
    { key: 'currency', label: '币种', type: 'select', read: (item) => item.currency, options: [{ value: 'CNY', label: '人民币' }] },
    { key: 'note', label: '备注', type: 'text', read: (item) => item.note },
    { key: 'itemCount', label: '物料项数', type: 'number', read: (item) => item.items.length },
    { key: 'shipmentCount', label: '发货单数', type: 'number', read: (item) => item._count.shipments },
  ])
}

export function buildShipmentSearchCatalog(customers: readonly FulfillmentCustomer[], locations: readonly InventoryLocationOption[] = []) {
  return defineResourceSearchCatalog<Shipment>('shipment.actual-fields', [
    { key: 'shipmentNo', label: '发货单号', type: 'text', read: (item) => item.shipmentNo },
    { key: 'voucherNo', label: '凭据号', type: 'text', read: (item) => item.voucherNo },
    { key: 'status', label: '状态', type: 'select', read: (item) => [item.status, shipmentStatusLabels[item.status]], options: shipmentStatusOptions },
    { key: 'customerId', label: '客户', type: 'select', read: (item) => [item.customerId || '__UNASSIGNED__', item.customerRef?.code, item.customerRef?.name, item.customer], options: [{ value: '__UNASSIGNED__', label: '通用/未绑定' }, ...customers.map((customer) => ({ value: customer.id, label: `${customer.code} · ${customer.name}` }))] },
    { key: 'product', label: '物料', type: 'text', read: (item) => [item.product.sku, item.product.name] },
    { key: 'locationId', label: '发货库位', type: locations.length ? 'select' : 'text', read: (item) => [item.locationId, item.location?.code, item.location?.name], options: locations.length ? locations.map((location) => ({ value: location.id, label: `${location.code} · ${location.name}` })) : undefined },
    { key: 'qty', label: '发货数量', type: 'number', read: (item) => item.qty },
    { key: 'unitPrice', label: '单价', type: 'number', read: (item) => item.unitPrice },
    { key: 'totalAmount', label: '总金额', type: 'number', read: (item) => item.totalAmount },
    { key: 'customer', label: '收货客户', type: 'text', read: (item) => item.customer },
    { key: 'customerPhone', label: '联系电话', type: 'text', read: (item) => item.customerPhone },
    { key: 'address', label: '收货地址', type: 'text', read: (item) => item.address },
    { key: 'trackingNo', label: '物流单号', type: 'text', read: (item) => item.trackingNo },
    { key: 'shippedBy', label: '发货人', type: 'text', read: (item) => item.shippedBy },
    { key: 'note', label: '备注', type: 'text', read: (item) => item.note },
    { key: 'salesOrder', label: '销售订单', type: 'text', read: (item) => [item.salesOrder?.orderNo, item.salesOrder?.voucherNo] },
    { key: 'lotNo', label: '库存批次', type: 'text', read: (item) => item.lotAllocations.flatMap((allocation) => [allocation.lot.lotNo, allocation.lot.supplierLotNo]) },
    { key: 'shippedAt', label: '发货日期', type: 'date', read: (item) => item.shippedAt },
    { key: 'createdAt', label: '创建日期', type: 'date', read: (item) => item.createdAt },
  ])
}

export function buildReturnSearchCatalog(customers: readonly FulfillmentCustomer[], locations: readonly InventoryLocationOption[]) {
  return defineResourceSearchCatalog<ReturnOrder>('return.actual-fields', [
    { key: 'returnNo', label: '退货单号', type: 'text', read: (item) => item.returnNo },
    { key: 'voucherNo', label: '凭据号', type: 'text', read: (item) => item.voucherNo },
    { key: 'status', label: '状态', type: 'select', read: (item) => [item.status, returnStatusLabels[item.status]], options: returnStatusOptions },
    { key: 'customerId', label: '客户', type: 'select', read: (item) => [item.shipment?.customerId || item.product.customerId || '__UNASSIGNED__', item.shipment?.customerRef?.code, item.shipment?.customerRef?.name, item.product.customer?.code, item.product.customer?.name], options: [{ value: '__UNASSIGNED__', label: '通用/未绑定' }, ...customers.map((customer) => ({ value: customer.id, label: `${customer.code} · ${customer.name}` }))] },
    { key: 'product', label: '退货物料', type: 'text', read: (item) => [item.product.sku, item.product.name] },
    { key: 'shipmentNo', label: '原发货单', type: 'text', read: (item) => item.shipment?.shipmentNo },
    { key: 'locationId', label: '退货库位', type: 'select', read: (item) => [item.location?.id, item.location?.code, item.location?.name], options: locations.map((location) => ({ value: location.id, label: `${location.code} · ${location.name}` })) },
    { key: 'qty', label: '退货数量', type: 'number', read: (item) => item.qty },
    { key: 'reason', label: '退货原因', type: 'text', read: (item) => item.reason },
    { key: 'note', label: '备注', type: 'text', read: (item) => item.note },
    { key: 'lotNo', label: '库存批次', type: 'text', read: (item) => item.lotAllocations.flatMap((allocation) => [allocation.shipmentAllocation.lot.lotNo, allocation.shipmentAllocation.lot.supplierLotNo]) },
    { key: 'createdAt', label: '创建日期', type: 'date', read: (item) => item.createdAt },
    { key: 'processedAt', label: '处理日期', type: 'date', read: (item) => item.processedAt },
  ])
}
