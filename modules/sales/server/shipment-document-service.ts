import { readCustomerPartySnapshot } from '@/modules/business-documents/server-index'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { attachmentUploadRoot, resolveAttachmentStoragePath } from '@/lib/attachment-storage'
import { getSystemSettings, type SystemSettings } from '@/lib/system-settings'
import { prisma } from '@/lib/prisma'
import { renderBusinessDocumentPdf, businessDocumentPrintProfile } from '@/modules/business-documents/server-index'
import type { BusinessDocumentPdfResult, BusinessDocumentPrintData } from '@/modules/business-documents/server-index'
import { getShipmentDeliveryNoteSource } from './fulfillment-query-service'
import { SalesDomainError } from '../domain/sales-errors'
import { customerShipmentPapers, customerShipmentPaperSizes, renderCustomerShipmentPdf, type CustomerShipmentPaper, type CustomerShipmentPrintData } from './customer-shipment-pdf'
import { unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'

export const shipmentDocumentAudiences = ['customer', 'internal'] as const
export type ShipmentDocumentAudience = typeof shipmentDocumentAudiences[number]

export const SHIPMENT_CUSTOMER_PDF_TYPE = 'SYSTEM_GENERATED_SHIPMENT_CUSTOMER_PDF'
export const SHIPMENT_INTERNAL_PDF_TYPE = 'SYSTEM_GENERATED_SHIPMENT_INTERNAL_PDF'

function publicDownloadPath(id: string) {
  return `/api/public/shipment-documents/${id}/download`
}

function customerDocumentOrigin(requestUrl?: string) {
  const value = process.env.MES_PUBLIC_BASE_URL?.trim() || requestUrl
  try {
    const url = new URL(value || '')
    const localDevelopment = process.env.NODE_ENV !== 'production'
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.username || url.password || (url.protocol !== 'https:' && !(localDevelopment && url.protocol === 'http:'))) {
      throw new Error('invalid origin')
    }
    return url.origin
  } catch {
    throw new SalesDomainError('请配置有效的 MES_PUBLIC_BASE_URL 公网 HTTPS 地址，以生成发货单下载二维码', 503)
  }
}

function documentTypeFor(audience: ShipmentDocumentAudience) {
  return audience === 'customer' ? SHIPMENT_CUSTOMER_PDF_TYPE : SHIPMENT_INTERNAL_PDF_TYPE
}

function formatDate(value?: Date | string | null) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'
}

function money(value: number) {
  return `¥${value.toFixed(2)}`
}

type ShipmentDocumentSource = Awaited<ReturnType<typeof getShipmentDeliveryNoteSource>>

/** 版本判定与渲染共用同一投影，内部成本、库位和更新时间不进入客户单据。 */
function customerPrintData(shipment: ShipmentDocumentSource, settings: SystemSettings): CustomerShipmentPrintData {
  const snapshot = readCustomerPartySnapshot(shipment.customerMasterSnapshot)
  return {
    shipmentNo: shipment.shipmentNo,
    shippedAt: formatDate(shipment.shippedAt),
    customer: shipment.customer,
    customerContact: snapshot ? snapshot.contact || '-' : shipment.customerRef?.contact || '-',
    customerPhone: snapshot ? snapshot.phone || '-' : shipment.customerPhone || shipment.customerRef?.phone || '-',
    address: snapshot ? snapshot.address || '-' : shipment.address || shipment.customerRef?.address || '-',
    companyName: settings.companyName,
    companyContact: settings.companyContact || '-',
    companyPhone: settings.companyPhone || '-',
    companyAddress: settings.companyAddress || '-',
    voucherNo: shipment.voucherNo || '-',
    trackingNo: shipment.trackingNo || '-',
    note: shipment.note || '-',
    rows: shipment.items.map((item, index) => [
      String(index + 1), item.material.code,
      `${item.material.name}${item.material.spec ? ` ${item.material.spec}` : ''}`,
      `${item.qty} ${item.unitSnapshot}`, money(Number(item.unitPrice)), money(Number(item.totalAmount)),
    ]),
    total: money(Number(shipment.totalAmount)),
    packages: shipment.packages.length > 0
      ? shipment.packages.map((item) => `${item.packageNo}（${item.items.reduce((sum, row) => sum + Number(row.quantity), 0)} ${item.items[0]?.unitSnapshot || ''}）`).join('；')
      : '未启用包裹单据',
  }
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

function customerArchivePrefix(paper: CustomerShipmentPaper) {
  return `shipment-document:customer:v5:paper=${customerShipmentPaperSizes[paper].join('x')}mm;`
}

function archiveProfile(audience: ShipmentDocumentAudience, revision: string, settings: SystemSettings, origin?: string, paper: CustomerShipmentPaper = 'continuous') {
  return audience === 'customer'
    ? `${customerArchivePrefix(paper)}content=${revision};download-origin=${origin};`
    : `shipment-document:internal:v1:source=${revision};${businessDocumentPrintProfile(settings)}`
}

async function latestArchivedShipmentPdf(
  id: string,
  audience: ShipmentDocumentAudience,
  revision: string,
  settings: SystemSettings,
  origin?: string,
  paper: CustomerShipmentPaper = 'continuous',
) {
  const profile = archiveProfile(audience, revision, settings, origin, paper)
  const archived = await prisma.documentAttachment.findFirst({
    where: {
      ownerType: 'SHIPMENT',
      ownerId: id,
      documentType: documentTypeFor(audience),
      deletedAt: null,
      note: audience === 'internal' ? { contains: profile } : { startsWith: customerArchivePrefix(paper) },
    },
    orderBy: { createdAt: 'desc' },
  })
  return archived?.note?.includes(profile) ? archived : null
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
    paper?: CustomerShipmentPaper
    regenerate?: boolean
    scope?: EffectiveDataScope
    requestUrl?: string
  } = {},
): Promise<BusinessDocumentPdfResult> {
  const audience = options.audience || 'customer'
  const paper = options.paper || 'continuous'
  if (!customerShipmentPapers.includes(paper)) throw new SalesDomainError('不支持的客户发货单纸型', 400)
  const scope = options.scope || unrestrictedDataScope
  const [shipment, settings] = await Promise.all([
    getShipmentDeliveryNoteSource(id, scope),
    getSystemSettings(),
  ])
  if (!['SHIPPED', 'DELIVERED'].includes(shipment.status)) throw new SalesDomainError('确认发货后才能输出发货单 PDF')
  if (!settings.companyName.trim()) throw new SalesDomainError('请先在系统设置填写发货单乙方企业名称')

  const customerData = audience === 'customer' ? customerPrintData(shipment, settings) : undefined
  const revision = customerData
    ? createHash('sha256').update(JSON.stringify(customerData)).digest('hex')
    : sourceRevision(shipment)
  const origin = audience === 'customer' ? customerDocumentOrigin(options.requestUrl) : undefined
  const profile = archiveProfile(audience, revision, settings, origin, paper)
  if (!options.regenerate) {
    const archivedPdf = await latestArchivedShipmentPdf(id, audience, revision, settings, origin, paper)
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

  const archiveId = randomUUID()
  const downloadPath = publicDownloadPath(archiveId)
  const pdf = audience === 'customer'
    ? await renderCustomerShipmentPdf(customerData!, new URL(downloadPath, origin).toString(), paper)
    : await renderBusinessDocumentPdf(internalPrintData(shipment), settings)
  const filename = audience === 'customer' ? `发货单-${shipment.shipmentNo}-${paper === 'a4' ? 'A4' : '连续纸'}.pdf` : `发货内部留档-${shipment.shipmentNo}.pdf`
  const ownerDirectory = path.join(attachmentUploadRoot(), 'SHIPMENT', id)
  await mkdir(ownerDirectory, { recursive: true })
  const fileName = `${Date.now()}-${randomUUID()}.pdf`
  const storagePath = path.join(ownerDirectory, fileName)
  await writeFile(storagePath, pdf)
  await prisma.documentAttachment.create({
    data: {
      id: archiveId,
      ownerType: 'SHIPMENT',
      ownerId: id,
      documentType: documentTypeFor(audience),
      originalName: filename,
      fileName,
      mimeType: 'application/pdf',
      size: pdf.byteLength,
      url: audience === 'customer' ? downloadPath : `/api/business-documents/shipment/${id}/print?audience=${audience}`,
      storagePath,
      note: profile,
    },
  })
  return { pdf, filename }
}

/** 旧下载地址的兼容包装：客户版 PDF 现在与统一业务单据入口共用同一归档。 */
export async function createShipmentDeliveryNote(id: string, scope: EffectiveDataScope = unrestrictedDataScope, requestUrl?: string) {
  return resolveShipmentDocumentPdf(id, { audience: 'customer', scope, requestUrl })
}

export async function createShipmentInternalArchive(id: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  return resolveShipmentDocumentPdf(id, { audience: 'internal', scope })
}

/** 持有纸质单据二维码的客户只能下载该归档版本，不能触发重新生成。 */
export async function resolvePublicShipmentDocumentPdf(id: string): Promise<BusinessDocumentPdfResult> {
  const unavailable = () => new SalesDomainError('发货单电子档不存在或已失效', 404)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) throw unavailable()
  const attachment = await prisma.documentAttachment.findFirst({
    where: {
      id, ownerType: 'SHIPMENT', documentType: SHIPMENT_CUSTOMER_PDF_TYPE,
      mimeType: 'application/pdf', deletedAt: null, url: publicDownloadPath(id),
    },
  })
  if (!attachment) throw unavailable()
  const shipment = await prisma.shipment.findUnique({
    where: { id: attachment.ownerId },
    select: { status: true, deletedAt: true },
  })
  if (!shipment) throw unavailable()
  if (shipment.status === 'CANCELLED') throw new SalesDomainError('该单已取消，电子档已停止下载。', 410)
  if (shipment.status === 'REVERSED') throw new SalesDomainError('该单已冲销，电子档已停止下载。', 410)
  if (shipment.deletedAt) throw new SalesDomainError('该单已归档，电子档已停止下载。', 410)
  if (!['SHIPPED', 'DELIVERED'].includes(shipment.status)) throw new SalesDomainError('该单当前状态不支持下载，请联系发货方。', 410)
  try {
    return { pdf: await readFile(resolveAttachmentStoragePath(attachment.storagePath)), filename: attachment.originalName }
  } catch {
    throw new SalesDomainError('电子档文件暂不可用，请联系发货方。', 404)
  }
}
