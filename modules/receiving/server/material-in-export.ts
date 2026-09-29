import { csvResponse, toCsv } from '@/lib/csv'
import type { toMaterialInRecord } from './material-in-service'

const statuses: Record<string, string> = { PENDING: '待收货', RECEIVED: '已收货', REJECTED: '已拒收', REVERSED: '已红冲' }
function safeText(value: unknown) {
  const text = value == null ? '' : String(value)
  return /^[\s]*[=+\-@]|^[\t\r\n]/.test(text) ? `'${text}` : text
}

export function buildMaterialInHistoryCsv(receipts: ReturnType<typeof toMaterialInRecord>[]) {
  const rows: unknown[][] = [[
    '来料单号', '明细行号', '来料日期（北京时间）', '单据状态', '已归档', '供应商编码', '供应商名称',
    '物料编码', '物料名称', '规格', '数量', '数量单位', '核算数量', '核算单位', '单价', '计价单位',
    '明细金额（元）', '供应商批次', '内部批次', '库位编码', '库位名称', '凭据号', '收货人', '备注', '辅助数量来源', '根数', '单根长度（核算单位）',
  ]]
  for (const receipt of receipts) {
    for (const line of receipt.items) {
      const location = line.location || receipt.location
      rows.push([
        safeText(receipt.inboundNo), line.lineNo,
        new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(receipt.inboundDate),
        statuses[receipt.status] || safeText(receipt.status), receipt.deletedAt ? '是' : '否',
        safeText(receipt.supplier.code), safeText(receipt.supplier.name),
        safeText(line.material.code), safeText(line.material.name), safeText(line.material.spec),
        Number(line.qty), safeText(line.unit), line.conversionSource === 'UNMEASURED' ? '' : Number(line.valuationQty), safeText(line.valuationUnit),
        Number(line.unitPrice), safeText(line.priceUnit), Number(line.totalAmount),
        safeText(line.batchNo), safeText(line.inventoryLot?.lotNo), safeText(location?.code), safeText(location?.name),
        safeText(receipt.voucherNo), safeText(receipt.receivedBy), safeText(receipt.note),
        safeText(line.conversionSource === 'UNMEASURED' ? '未测长（未知）' : line.conversionSource === 'CALCULATED_LENGTH' ? '单根长度×根数（计算值）' : line.conversionSource),
        line.conversionSource === 'CALCULATED_LENGTH' ? line.pieceCount : '',
        line.conversionSource === 'CALCULATED_LENGTH' && line.pieceCount ? Number(line.totalLength) / line.pieceCount : '',
      ])
    }
  }
  return toCsv(rows)
}

export function materialInHistoryCsvResponse(receipts: ReturnType<typeof toMaterialInRecord>[]) {
  const response = csvResponse('material-in-history.csv', buildMaterialInHistoryCsv(receipts))
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
