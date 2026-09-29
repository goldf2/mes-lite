import type { Shipment } from '../contracts/fulfillment'
import type { HistoryResult } from '@/app/components/resource/DocumentHistoryPage'

export async function loadShipmentHistory(params: URLSearchParams): Promise<HistoryResult> {
  const response = await fetch(`/api/shipments?${params}`, { cache: 'no-store' })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || '查询发货历史失败')
  return { pagination: result.pagination, summary: result.summary, lines: (result.data as (Shipment & { deletedAt?: string | null })[]).flatMap(shipment => shipment.items.map(line => ({
    id: line.id, documentNo: shipment.shipmentNo, date: shipment.shippedAt || null, party: shipment.customer,
    material: `${line.material.code} · ${line.material.name}`, spec: line.material.spec || '', qty: Number(line.qty), unit: line.unitSnapshot,
    unitPrice: Number(line.unitPrice), priceUnit: line.unitSnapshot, amount: Number(line.totalAmount), status: shipment.status, archived: !!shipment.deletedAt,
  }))) }
}
export async function exportShipmentHistory(params: URLSearchParams) {
  const query = new URLSearchParams(params)
  query.set('format', 'csv')
  const response = await fetch(`/api/shipments?${query}`, { cache: 'no-store' })
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || '导出发货历史失败') }
  return response.blob()
}
