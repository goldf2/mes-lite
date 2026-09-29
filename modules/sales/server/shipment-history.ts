import { csvResponse, toCsv } from '@/lib/csv'
import { SalesDomainError } from '../domain/sales-errors'
import { shipmentStatusLabels } from '../model/fulfillment-view'
import type { listShipments } from './fulfillment-query-service'
import { parseStatusFilter } from '@/lib/status-filter'
import { parseResourceSearchConditions } from '@/lib/resource-search'
import { shipmentSearchFieldKeys } from '../model/sales-search-fields'

export function shipmentHistoryQuery(params: URLSearchParams) {
  const advanced = parseResourceSearchConditions(params.get('advanced'), shipmentSearchFieldKeys)
  if (advanced.error) throw new SalesDomainError(advanced.error)
  const page = Number(params.get('page') || 1), size = Number(params.get('pageSize') || 20)
  return {
    statuses: parseStatusFilter(params), keyword: params.get('keyword'), customerId: params.get('customerId'), customer: params.get('customer'), advancedConditions: advanced.conditions,
    page: Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1, pageSize: Number.isFinite(size) ? Math.min(100, Math.max(1, Math.floor(size))) : 20,
    startDate: params.get('startDate'), endDate: params.get('endDate'), includeArchived: params.get('includeArchived') === 'true',
    includeSummary: params.get('includeSummary') === 'true', exportAll: params.get('format') === 'csv',
  }
}

export function shipmentHistoryDateRange(startDate?: string | null, endDate?: string | null) {
  const parse = (value?: string | null) => {
    if (!value) return undefined
    const date = new Date(`${value}T00:00:00+08:00`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || new Date(date.getTime() + 28_800_000).toISOString().slice(0, 10) !== value) throw new SalesDomainError('发货日期无效')
    return date
  }
  const start = parse(startDate), end = parse(endDate)
  if (start && end && start > end) throw new SalesDomainError('结束日期不能早于开始日期')
  return start || end ? { gte: start, lt: end ? new Date(end.getTime() + 86_400_000) : undefined } : undefined
}

export function summarizeShipmentHistory(lines: { qty: number; unitSnapshot: string; totalAmount: number; shipment: { status: string } }[]) {
  const groups = new Map<string, { status: string; unit: string; qty: number; amount: number; lineCount: number }>()
  for (const line of lines) {
    const key = JSON.stringify([line.shipment.status, line.unitSnapshot])
    const group = groups.get(key) || { status: line.shipment.status, unit: line.unitSnapshot, qty: 0, amount: 0, lineCount: 0 }
    group.qty += line.qty; group.amount += line.totalAmount; group.lineCount++
    groups.set(key, group)
  }
  return Array.from(groups.values()).map(group => ({ ...group, qty: Number(group.qty.toFixed(6)), amount: Number(group.amount.toFixed(2)) })).sort((a, b) => a.status.localeCompare(b.status) || a.unit.localeCompare(b.unit))
}

const safe = (value: unknown) => { const text = value == null ? '' : String(value); return /^\s*[=+\-@]|^[\t\r\n]/.test(text) ? `'${text}` : text }
export function shipmentHistoryCsvResponse(shipments: Awaited<ReturnType<typeof listShipments>>['data']) {
  const rows: unknown[][] = [['发货单号', '发货日期（北京时间）', '状态', '已归档', '客户', '物料编码', '物料名称', '规格', '数量', '单位快照', '单价（元）', '明细金额（元）', '库位', '凭据号', '物流单号', '发货人', '备注']]
  for (const shipment of shipments) for (const line of shipment.items) rows.push([
    safe(shipment.shipmentNo), shipment.shippedAt ? shipment.shippedAt.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai', hour12: false }) : '',
    shipmentStatusLabels[shipment.status] || safe(shipment.status), shipment.deletedAt ? '是' : '否', safe(shipment.customer),
    safe(line.material.code), safe(line.material.name), safe(line.material.spec), line.qty, safe(line.unitSnapshot), line.unitPrice, line.totalAmount,
    safe(`${line.location.code} · ${line.location.name}`), safe(shipment.voucherNo), safe(shipment.trackingNo), safe(shipment.shippedBy), safe(shipment.note),
  ])
  const response = csvResponse('shipment-history.csv', toCsv(rows))
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
