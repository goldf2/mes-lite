import { defineResourceSearchCatalog } from '@/lib/resource-search'
import type { DispatchCustomer, DispatchEmployeeOption, DispatchRecord } from '../contracts/dispatch'
import { dispatchPriorityLabels, dispatchStatusLabels, dispatchStatusOptions } from '../contracts/dispatch'
import type { FlowTransferEmployeeOption, FlowTransferLocationOption, FlowTransferRecord } from '../contracts/flow-transfer'
import type { ProductionOrder } from '../contracts/production-order'
import { productionOrderStatusLabels, productionOrderStatusOptions } from './production-order-view'

export const productionOrderSearchFieldKeys = ['orderNo', 'groupNo', 'voucherNo', 'status', 'customerId', 'target', 'bom', 'planQty', 'completeQty', 'scrapQty', 'createdAt'] as const
export const dispatchSearchFieldKeys = ['dispatchNo', 'voucherNo', 'status', 'customerId', 'order', 'material', 'step', 'workCenter', 'employee', 'planQty', 'priority', 'note', 'createdAt'] as const
export const flowTransferSearchFieldKeys = ['transferNo', 'status', 'material', 'sourceLocationId', 'targetLocationId', 'quantity', 'unit', 'employeeId', 'operator', 'note', 'transferDate', 'confirmedBy', 'reversedBy', 'reverseReason'] as const

export function buildProductionOrderSearchCatalog(customers: readonly DispatchCustomer[] = []) {
  return defineResourceSearchCatalog<ProductionOrder>('production-order.actual-fields', [
    { key: 'orderNo', label: '生产订单号', type: 'text', read: (item) => item.orderNo },
    { key: 'groupNo', label: '订单组号', type: 'text', read: (item) => item.groupNo },
    { key: 'voucherNo', label: '凭据号', type: 'text', read: (item) => item.voucherNo },
    { key: 'status', label: '状态', type: 'select', read: (item) => [item.status, productionOrderStatusLabels[item.status]], options: productionOrderStatusOptions },
    { key: 'customerId', label: '客户', type: customers.length ? 'select' : 'text', read: (item) => [item.product.customerId, item.product.customer?.code, item.product.customer?.name, item.targetMaterial?.customerId, item.targetMaterial?.customer?.code, item.targetMaterial?.customer?.name], options: customers.length ? [{ value: '__UNASSIGNED__', label: '通用/未绑定' }, ...customers.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))] : undefined },
    { key: 'target', label: '生产物料', type: 'text', read: (item) => [item.targetMaterial?.code, item.targetMaterial?.name, item.product.sku, item.product.name] },
    { key: 'bom', label: 'BOM', type: 'text', read: (item) => [item.bom?.name, item.bom?.version, item.bomName, item.bomVersion] },
    { key: 'planQty', label: '计划数量', type: 'number', read: (item) => item.planQty },
    { key: 'completeQty', label: '完成数量', type: 'number', read: (item) => item.completeQty },
    { key: 'scrapQty', label: '报废数量', type: 'number', read: (item) => item.scrapQty },
    { key: 'createdAt', label: '创建日期', type: 'date', read: (item) => item.createdAt },
  ])
}

export function buildDispatchSearchCatalog(customers: readonly DispatchCustomer[], employees: readonly DispatchEmployeeOption[]) {
  return defineResourceSearchCatalog<DispatchRecord>('dispatch.actual-fields', [
    { key: 'dispatchNo', label: '派工单号', type: 'text', read: (item) => item.dispatchNo },
    { key: 'voucherNo', label: '凭据号', type: 'text', read: (item) => item.voucherNo },
    { key: 'status', label: '状态', type: 'select', read: (item) => [item.status, dispatchStatusLabels[item.status]], options: dispatchStatusOptions },
    { key: 'customerId', label: '客户', type: 'select', read: (item) => [item.order.product.customerId, item.order.product.customer?.code, item.order.product.customer?.name, item.order.targetMaterial?.customerId, item.order.targetMaterial?.customer?.code, item.order.targetMaterial?.customer?.name], options: [{ value: '__UNASSIGNED__', label: '通用/未绑定' }, ...customers.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))] },
    { key: 'order', label: '生产订单', type: 'text', read: (item) => item.order.orderNo },
    { key: 'material', label: '生产物料', type: 'text', read: (item) => [item.order.targetMaterial?.code, item.order.targetMaterial?.name, item.order.product.sku, item.order.product.name] },
    { key: 'step', label: '工序', type: 'text', read: (item) => [item.step.name, item.step.stepNo] },
    { key: 'workCenter', label: '工作中心', type: 'text', read: (item) => [item.step.workCenter?.code, item.step.workCenter?.name, item.step.workstation] },
    { key: 'employee', label: '生产员工', type: employees.length ? 'select' : 'text', read: (item) => [item.employeeId, item.employee?.code, item.employee?.name, item.workerName], options: employees.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` })) },
    { key: 'planQty', label: '计划数量', type: 'number', read: (item) => item.planQty },
    { key: 'priority', label: '优先级', type: 'select', read: (item) => [item.priority, dispatchPriorityLabels[item.priority]], options: Object.entries(dispatchPriorityLabels).map(([value, label]) => ({ value, label })) },
    { key: 'note', label: '备注', type: 'text', read: (item) => item.note },
    { key: 'createdAt', label: '创建日期', type: 'date', read: (item) => item.createdAt },
  ])
}

export function buildFlowTransferSearchCatalog(locations: readonly FlowTransferLocationOption[], employees: readonly FlowTransferEmployeeOption[]) {
  const statusOptions = [{ value: 'DRAFT', label: '草稿' }, { value: 'CONFIRMED', label: '已确认' }, { value: 'REVERSED', label: '已冲销' }]
  return defineResourceSearchCatalog<FlowTransferRecord>('flow-transfer.actual-fields', [
    { key: 'transferNo', label: '转移单号', type: 'text', read: (item) => item.transferNo },
    { key: 'status', label: '状态', type: 'select', read: (item) => [item.status, statusOptions.find((option) => option.value === item.status)?.label], options: statusOptions },
    { key: 'material', label: '物料', type: 'text', read: (item) => [item.material.code, item.material.name, item.material.spec] },
    { key: 'sourceLocationId', label: '转出库位', type: 'select', read: (item) => [item.sourceLocation.id, item.sourceLocation.code, item.sourceLocation.name], options: locations.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` })) },
    { key: 'targetLocationId', label: '转入库位', type: 'select', read: (item) => [item.targetLocation.id, item.targetLocation.code, item.targetLocation.name], options: locations.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` })) },
    { key: 'quantity', label: '转移数量', type: 'number', read: (item) => item.quantity },
    { key: 'unit', label: '单位', type: 'text', read: (item) => item.unit },
    { key: 'employeeId', label: '操作员工', type: employees.length ? 'select' : 'text', read: (item) => [item.employeeId, item.employee?.code, item.employee?.name, item.employee?.department], options: employees.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` })) },
    { key: 'operator', label: '操作人', type: 'text', read: (item) => item.operator },
    { key: 'note', label: '备注', type: 'text', read: (item) => item.note },
    { key: 'transferDate', label: '转移日期', type: 'date', read: (item) => item.transferDate },
    { key: 'confirmedBy', label: '确认人', type: 'text', read: (item) => item.confirmedBy },
    { key: 'reversedBy', label: '冲销人', type: 'text', read: (item) => item.reversedBy },
    { key: 'reverseReason', label: '冲销原因', type: 'text', read: (item) => item.reverseReason },
  ])
}
