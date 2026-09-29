'use client'
import DocumentHistoryPage, { type HistoryAdapter } from '@/app/components/resource/DocumentHistoryPage'
import { listMaterialInRecords, exportMaterialInRecords } from '../client/material-in-api'
import { materialInStatusLabels } from '../model/material-in-view'

const adapter: HistoryAdapter = {
  title: '来料历史核查', dateLabel: '来料日期', description: '按来料日期核对供应商来料。已收货代表当前有效来料，拒收和红冲单独列示。', statuses: materialInStatusLabels,
  download: exportMaterialInRecords,
  async load(params) {
    const result = await listMaterialInRecords(params)
    return { ...result, lines: result.data.flatMap(receipt => receipt.items.map(line => ({
      id: line.id, documentNo: receipt.inboundNo, date: receipt.inboundDate, party: receipt.supplier.name,
      material: `${line.material.code} · ${line.material.name}`, spec: line.material.spec || '', qty: Number(line.qty), unit: line.unit,
      unitPrice: Number(line.unitPrice), priceUnit: line.priceUnit || '', amount: Number(line.totalAmount), status: receipt.status, archived: !!receipt.deletedAt,
    }))) }
  },
}
export default function MaterialInHistoryPage() { return <DocumentHistoryPage adapter={adapter} /> }
