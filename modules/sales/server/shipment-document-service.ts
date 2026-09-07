import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { attachmentUploadRoot, resolveAttachmentStoragePath } from '@/lib/attachment-storage'
import { getSystemSettings, type SystemSettings } from '@/lib/system-settings'
import { prisma } from '@/lib/prisma'
import { renderBusinessDocumentPdf, businessDocumentPrintProfile } from '@/modules/business-documents/server-index'
import type { BusinessDocumentPdfResult, BusinessDocumentPrintData } from '@/modules/business-documents/server-index'
import { getShipmentDeliveryNoteSource } from './fulfillment-query-service'
import { SalesDomainError } from '../domain/sales-errors'
import { unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'

export const shipmentDocumentAudiences = ['customer', 'internal'] as const
export type ShipmentDocumentAudience = typeof shipmentDocumentAudiences[number]

export const SHIPMENT_CUSTOMER_PDF_TYPE = 'SYSTEM_GENERATED_SHIPMENT_CUSTOMER_PDF'
export const SHIPMENT_INTERNAL_PDF_TYPE = 'SYSTEM_GENERATED_SHIPMENT_INTERNAL_PDF'

const fontPaths = [
  process.env.PDF_FONT_PATH,
  path.join(process.cwd(), 'assets/fonts/NotoSansCJKsc-Regular.otf'),
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
].filter((fontPath): fontPath is string => Boolean(fontPath))

function documentTypeFor(audience: ShipmentDocumentAudience) {
  return audience === 'customer' ? SHIPMENT_CUSTOMER_PDF_TYPE : SHIPMENT_INTERNAL_PDF_TYPE
}

function formatDate(value?: Date | string | null) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'
}

function money(value: number) {
  return `¥${value.toFixed(2)}`
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
  doc.text(text, x + 6, y + 8, { width: width - 12, height: height - 12, ellipsis: true, ...options })
}

type ShipmentDocumentSource = Awaited<ReturnType<typeof getShipmentDeliveryNoteSource>>

function setupDocument(doc: PDFKit.PDFDocument, chunks: Buffer[], resolve: (value: Buffer) => void, reject: (reason?: unknown) => void) {
  doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
  doc.on('end', () => resolve(Buffer.concat(chunks)))
  doc.on('error', reject)
  const fontPath = fontPaths.find((candidate) => fs.existsSync(candidate))
  if (fontPath) {
    doc.registerFont('main', fontPath)
    doc.font('main')
  }
}

async function renderCustomerShipmentPdf(shipment: ShipmentDocumentSource, settings: SystemSettings) {
  const shipmentQrCode = await QRCode.toBuffer(shipment.shipmentNo, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
    color: { dark: '#000000', light: '#ffffff' },
  })
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 })
    const chunks: Buffer[] = []
    setupDocument(doc, chunks, resolve, reject)

    const pageWidth = doc.page.width
    const left = 48
    const right = pageWidth - 48
    const tableWidth = right - left
    doc.fontSize(22).text('客户发货单', left, 48, { align: 'center', width: tableWidth })
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
    doc.text(`明细项数：${shipment.items.length} 项`, left, 242)
    doc.text(`客户凭证号：${shipment.voucherNo || '-'}`, left + 220, 242)
    doc.text(`物流单号：${shipment.trackingNo || '-'}`, left + 390, 242, { width: 155, ellipsis: true })

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
        item.material.code,
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
      ? shipment.packages.map((item) => `${item.packageNo}（${item.items.reduce((sum, row) => sum + Number(row.quantity), 0)} ${item.items[0]?.unitSnapshot || ''}）`).join('；')
      : '未启用包裹单据'
    const noteY = totalY + 50
    doc.fontSize(9).text(`包裹：${packageSummary}`, left, noteY, { width: tableWidth, ellipsis: true })
    doc.fontSize(10)
    doc.text(`物流单号：${shipment.trackingNo || '-'}`, left, noteY + 24)
    doc.text(`备注：${shipment.note || '-'}`, left, noteY + 48, { width: tableWidth })
    const signY = noteY + 108
    doc.text('乙方发货人：____________', left, signY)
    doc.text('甲方收货人：____________', left + 210, signY)
    doc.text('签收日期：______________', left + 390, signY)
    doc.fontSize(8).fillColor('#666666')
    doc.text('本客户发货单由 MES-lite 系统生成，用于双方发货交接、签收和对账。', left, doc.page.height - 72, { align: 'center', width: tableWidth })
    doc.end()
  })
}

function internalPrintData(shipment: ShipmentDocumentSource): BusinessDocumentPrintData {
  return {
    title: '发货内部留档',
    documentNo: shipment.shipmentNo,
    status: shipment.status,
    documentDate: formatDate(shipment.shippedAt || shipment.createdAt),
    referenceNo: shipment.voucherNo,
    partyLabel: '客户',
    partyName: shipment.customer,
    summaryFields: [
      { label: '物流单号', value: shipment.trackingNo || '-' },
      { label: '发货库位', value: Array.from(new Set(shipment.items.map((item) => `${item.location.code} · ${item.location.name}`))).join('、') || '-' },
      { label: '发货人', value: shipment.shippedBy || '-' },
      { label: '出库成本', value: money(Number(shipment.shippedCostAmount)) },
      { label: '包裹数', value: `${shipment.packages.length} 个` },
      { label: '冲销状态', value: shipment.status === 'REVERSED' ? `已冲销：${shipment.reverseReason || '-'}` : '未冲销' },
    ],
    columns: [
      { label: '序号', key: 'index', width: 0.6, align: 'center' },
      { label: '物料编码', key: 'code', width: 1.4 },
      { label: '物料名称/规格', key: 'material', width: 2.3 },
      { label: '库位', key: 'location', width: 1.3 },
      { label: '批次', key: 'lot', width: 1.7 },
      { label: '数量', key: 'qty', width: 1.1, align: 'right' },
      { label: '出库成本', key: 'cost', width: 1.2, align: 'right' },
    ],
    rows: shipment.items.map((item, index) => ({
      index: String(index + 1),
      code: item.material.code,
      material: `${item.material.name}${item.material.spec ? ` · ${item.material.spec}` : ''}`,
      location: `${item.location.code} · ${item.location.name}`,
      lot: item.lotAllocations?.length
        ? item.lotAllocations.map((allocation) => allocation.lot.lotNo || allocation.lot.supplierLotNo || '-').join('、')
        : (item.stockShortage ? `欠库 ${item.stockShortage.status}` : '-'),
      qty: `${item.qty} ${item.unitSnapshot}`,
      cost: money(Number(item.shippedCostAmount)),
    })),
    totalLabel: '出库成本合计',
    totalValue: money(Number(shipment.shippedCostAmount)),
    note: [shipment.note, shipment.cancelReason ? `取消原因：${shipment.cancelReason}` : null, shipment.reverseReason ? `冲销原因：${shipment.reverseReason}` : null].filter(Boolean).join('；') || '-',
    signatures: ['制单人', '仓管员', '复核人'],
  }
}

function sourceRevision(shipment: ShipmentDocumentSource) {
  return shipment.updatedAt.toISOString()
}

function archiveProfile(audience: ShipmentDocumentAudience, revision: string, settings: SystemSettings) {
  return `shipment-document:${audience}:v1:source=${revision};${businessDocumentPrintProfile(settings)}`
}

async function latestArchivedShipmentPdf(
  id: string,
  audience: ShipmentDocumentAudience,
  revision: string,
  settings: SystemSettings,
) {
  const profile = archiveProfile(audience, revision, settings)
  return prisma.documentAttachment.findFirst({
    where: {
      ownerType: 'SHIPMENT',
      ownerId: id,
      documentType: documentTypeFor(audience),
      deletedAt: null,
      note: { contains: profile },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function hasArchivedShipmentDocumentPdf(id: string, audience: ShipmentDocumentAudience) {
  return Boolean(await prisma.documentAttachment.findFirst({
    where: { ownerType: 'SHIPMENT', ownerId: id, documentType: documentTypeFor(audience), deletedAt: null },
    select: { id: true },
  }))
}

export async function resolveShipmentDocumentPdf(
  id: string,
  options: {
    audience?: ShipmentDocumentAudience
    regenerate?: boolean
    scope?: EffectiveDataScope
  } = {},
): Promise<BusinessDocumentPdfResult> {
  const audience = options.audience || 'customer'
  const scope = options.scope || unrestrictedDataScope
  const [shipment, settings] = await Promise.all([
    getShipmentDeliveryNoteSource(id, scope),
    getSystemSettings(),
  ])
  if (!['SHIPPED', 'DELIVERED'].includes(shipment.status)) throw new SalesDomainError('确认发货后才能输出发货单 PDF')
  if (!settings.companyName.trim()) throw new SalesDomainError('请先在系统设置填写发货单乙方企业名称')

  const revision = sourceRevision(shipment)
  const profile = archiveProfile(audience, revision, settings)
  if (!options.regenerate) {
    const archivedPdf = await latestArchivedShipmentPdf(id, audience, revision, settings)
    if (archivedPdf) {
      try {
        return {
          pdf: await readFile(resolveAttachmentStoragePath(archivedPdf.storagePath)),
          filename: archivedPdf.originalName,
        }
      } catch {
        // 存档文件丢失时按同一快照重新生成，并保留数据库记录供排查。
      }
    }
  }

  const pdf = audience === 'customer'
    ? await renderCustomerShipmentPdf(shipment, settings)
    : await renderBusinessDocumentPdf(internalPrintData(shipment), settings)
  const filename = audience === 'customer' ? `发货单-${shipment.shipmentNo}.pdf` : `发货内部留档-${shipment.shipmentNo}.pdf`
  const ownerDirectory = path.join(attachmentUploadRoot(), 'SHIPMENT', id)
  await mkdir(ownerDirectory, { recursive: true })
  const fileName = `${Date.now()}-${randomUUID()}.pdf`
  const storagePath = path.join(ownerDirectory, fileName)
  await writeFile(storagePath, pdf)
  await prisma.documentAttachment.create({
    data: {
      ownerType: 'SHIPMENT',
      ownerId: id,
      documentType: documentTypeFor(audience),
      originalName: filename,
      fileName,
      mimeType: 'application/pdf',
      size: pdf.byteLength,
      url: `/api/business-documents/shipment/${id}/print?audience=${audience}`,
      storagePath,
      note: profile,
    },
  })
  return { pdf, filename }
}

/** 旧下载地址的兼容包装：客户版 PDF 现在与统一业务单据入口共用同一归档。 */
export async function createShipmentDeliveryNote(id: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  return resolveShipmentDocumentPdf(id, { audience: 'customer', scope })
}

export async function createShipmentInternalArchive(id: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  return resolveShipmentDocumentPdf(id, { audience: 'internal', scope })
}
