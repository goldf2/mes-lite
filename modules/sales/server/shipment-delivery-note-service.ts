import fs from 'node:fs'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { getSystemSettings, type SystemSettings } from '@/lib/system-settings'
import { SalesDomainError } from '../domain/sales-errors'
import { getShipmentDeliveryNoteSource } from './fulfillment-query-service'
import { unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'

const FONT_PATHS = [
  process.env.PDF_FONT_PATH,
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
].filter((fontPath): fontPath is string => Boolean(fontPath))

function formatDate(value?: Date | string | null) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'
}

function money(value: number) {
  return `¥${value.toFixed(2)}`
}

function displayMaterialCode(code?: string | null) {
  return code?.startsWith('MAT-') ? code.slice(4) : code || ''
}

function drawCell(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: PDFKit.Mixins.TextOptions = {},
) {
  doc.rect(x, y, width, height).stroke()
  doc.text(text, x + 6, y + 8, { width: width - 12, height: height - 12, ...options })
}

type DeliveryNoteShipment = Awaited<ReturnType<typeof getShipmentDeliveryNoteSource>>

async function renderDeliveryNotePdf(shipment: DeliveryNoteShipment, settings: SystemSettings) {
  const shipmentQrCode = await QRCode.toBuffer(shipment.shipmentNo, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
    color: { dark: '#000000', light: '#ffffff' },
  })
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 })
    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    const fontPath = FONT_PATHS.find((candidate) => fs.existsSync(candidate))
    if (fontPath) {
      doc.registerFont('main', fontPath)
      doc.font('main')
    }

    const pageWidth = doc.page.width
    const left = 48
    const right = pageWidth - 48
    const tableWidth = right - left
    doc.fontSize(22).text('发货单', left, 48, { align: 'center', width: tableWidth })
    doc.moveDown(0.5)
    doc.fontSize(10).text(settings.companyName, left, 78, { align: 'center', width: tableWidth })
    doc.image(shipmentQrCode, right - 52, 46, { width: 48, height: 48 })
    doc.fontSize(10)
    doc.text(`发货单号：${shipment.shipmentNo}`, left, 108)
    doc.text(`发货时间：${formatDate(shipment.shippedAt)}`, left + 280, 112)

    const partyTop = 136
    const partyWidth = tableWidth / 2
    doc.rect(left, partyTop, partyWidth, 92).stroke()
    doc.rect(left + partyWidth, partyTop, partyWidth, 92).stroke()
    doc.fontSize(11).text('甲方（收货方）', left + 8, partyTop + 8, { width: partyWidth - 16 })
    doc.fontSize(9).text(`名称：${shipment.customer}`, left + 8, partyTop + 30, { width: partyWidth - 16 })
    doc.text(`电话：${shipment.customerPhone || shipment.customerRef?.phone || '-'}`, left + 8, partyTop + 48, { width: partyWidth - 16 })
    doc.text(`地址：${shipment.address || shipment.customerRef?.address || '-'}`, left + 8, partyTop + 66, { width: partyWidth - 16, ellipsis: true })
    doc.fontSize(11).text('乙方（供货方）', left + partyWidth + 8, partyTop + 8, { width: partyWidth - 16 })
    doc.fontSize(9).text(`名称：${settings.companyName}`, left + partyWidth + 8, partyTop + 30, { width: partyWidth - 16 })
    doc.text(`联系人：${settings.companyContact || '-'}`, left + partyWidth + 8, partyTop + 48, { width: partyWidth - 16 })
    doc.text(`电话/地址：${settings.companyPhone || '-'} / ${settings.companyAddress || '-'}`, left + partyWidth + 8, partyTop + 66, { width: partyWidth - 16, ellipsis: true })

    doc.fontSize(9)
    const locations = Array.from(new Set(shipment.items.map((item) => `${item.location.code} · ${item.location.name}`)))
    doc.text(`明细项数：${shipment.items.length} 项`, left, 242)
    doc.text(`客户凭证号：${shipment.voucherNo || '-'}`, left + 220, 242)
    doc.text(`发货库位：${locations.join('、')}`, left + 390, 242, { width: 155, ellipsis: true })

    const tableTop = 264
    const headerHeight = 34
    const rowHeight = 40
    const widths = [48, 100, 150, 54, 66, 81]
    const headers = ['序号', '物料编码', '物料名称', '数量', '单价', '金额']
    const drawHeader = (y: number) => {
      let headerX = left
      doc.fontSize(10)
      headers.forEach((header, index) => {
        drawCell(doc, header, headerX, y, widths[index], headerHeight, { align: 'center' })
        headerX += widths[index]
      })
      return y + headerHeight
    }
    let rowY = drawHeader(tableTop)
    shipment.items.forEach((item, rowIndex) => {
      if (rowY + rowHeight > doc.page.height - 130) {
        doc.addPage()
        rowY = drawHeader(52)
      }
      let rowX = left
      const values = [
        String(rowIndex + 1),
        displayMaterialCode(item.material.code),
        `${item.material.name}${item.material.spec ? ` ${item.material.spec}` : ''}`,
        `${item.qty} ${item.unitSnapshot}`,
        money(Number(item.unitPrice)),
        money(Number(item.totalAmount)),
      ]
      values.forEach((value, index) => {
        drawCell(doc, value, rowX, rowY, widths[index], rowHeight, { align: index === 2 ? 'left' : 'center' })
        rowX += widths[index]
      })
      rowY += rowHeight
    })
    const totalY = rowY
    const totalLabelWidth = widths.slice(0, 5).reduce((sum, width) => sum + width, 0)
    drawCell(doc, '合计', left, totalY, totalLabelWidth, 34, { align: 'right' })
    drawCell(doc, money(Number(shipment.totalAmount)), left + totalLabelWidth, totalY, widths[5], 34, { align: 'center' })

    const packageSummary = shipment.packages.length > 0
      ? shipment.packages.map((item) => `${item.packageNo}(${item.items.reduce((sum, row) => sum + Number(row.quantity), 0)} ${item.items[0]?.unitSnapshot || ''})`).join('；')
      : '未启用货箱单据'
    const noteY = totalY + 50
    doc.fontSize(9).text(`货箱单据：${packageSummary}`, left, noteY, { width: tableWidth, ellipsis: true })
    doc.fontSize(10)
    doc.text(`物流单号：${shipment.trackingNo || '-'}`, left, noteY + 24)
    doc.text(`备注：${shipment.note || '-'}`, left, noteY + 48, { width: tableWidth })
    const signY = noteY + 108
    doc.text('乙方发货人：____________', left, signY)
    doc.text('甲方收货人：____________', left + 210, signY)
    doc.text('签收日期：______________', left + 390, signY)
    doc.fontSize(8).fillColor('#666666')
    doc.text('本发货单由 MES-lite 系统生成，用于双方发货交接、签收和对账留存。', left, doc.page.height - 72, { align: 'center', width: tableWidth })
    doc.end()
  })
}

export async function createShipmentDeliveryNote(id: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  const [shipment, settings] = await Promise.all([getShipmentDeliveryNoteSource(id, scope), getSystemSettings()])
  if (!['SHIPPED', 'DELIVERED'].includes(shipment.status)) throw new SalesDomainError('确认发货后才能下载发货单 PDF')
  if (!settings.companyName.trim()) throw new SalesDomainError('请先在系统设置填写发货单乙方企业名称')
  return {
    pdf: await renderDeliveryNotePdf(shipment, settings),
    filename: `发货单-${shipment.shipmentNo}.pdf`,
  }
}
