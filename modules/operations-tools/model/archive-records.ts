import type { ArchivedRecord, ArchivedRecordsPayload, ArchiveModel, RawArchivedRecord } from '../contracts/maintenance'

function appendRecords(
  target: ArchivedRecord[],
  items: RawArchivedRecord[] | undefined,
  type: string,
  model: ArchiveModel,
  readLabel: (item: RawArchivedRecord) => string,
) {
  for (const item of items || []) {
    target.push({ id: item.id, label: readLabel(item), type, model, deletedAt: item.deletedAt })
  }
}

export function flattenArchivedRecords(data: ArchivedRecordsPayload): ArchivedRecord[] {
  const records: ArchivedRecord[] = []
  appendRecords(records, data.materials, '物料', 'material', (item) => item.code || '-')
  appendRecords(records, data.suppliers, '供应商', 'supplier', (item) => item.name || '-')
  appendRecords(records, data.customers, '客户', 'customer', (item) => item.name || '-')
  appendRecords(records, data.materialIn, '来料单', 'materialIn', (item) => item.inboundNo || '-')
  appendRecords(records, data.workInstructions, '产品文档', 'workInstruction', (item) => `${item.material?.code || '-'} · ${item.material?.name || '未知产品'}`)
  appendRecords(records, data.orders, '工单', 'order', (item) => item.orderNo || '-')
  appendRecords(records, data.dispatches, '派工单', 'dispatch', (item) => item.dispatchNo || '-')
  appendRecords(records, data.shipments, '发货单', 'shipment', (item) => item.shipmentNo || '-')
  appendRecords(records, data.returns, '退货单', 'return', (item) => item.returnNo || '-')
  return records.sort((a, b) => String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')))
}
