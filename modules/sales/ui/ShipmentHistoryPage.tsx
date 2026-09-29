'use client'
import DocumentHistoryPage, { type HistoryAdapter } from '@/app/components/resource/DocumentHistoryPage'
import { loadShipmentHistory, exportShipmentHistory } from '../client/shipment-history-api'
import { shipmentStatusLabels } from '../model/fulfillment-view'

const adapter: HistoryAdapter = {
  title: '发货历史核查', dateLabel: '实际发货日期', description: '按实际发货日期核对。选择日期后不包含尚未发货的单据；留空可查全部。金额为当前单据价格，不是历史时点快照；退货另记，不在此扣减。',
  statuses: shipmentStatusLabels, load: loadShipmentHistory, download: exportShipmentHistory,
}
export default function ShipmentHistoryPage() { return <DocumentHistoryPage adapter={adapter} /> }
