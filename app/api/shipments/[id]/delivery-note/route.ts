import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import PDFDocument from 'pdfkit'
import fs from 'fs'
import { requireResourcePermission } from '@/lib/permissions'
import { getSystemSettings, SystemSettings } from '@/lib/system-settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FONT_PATHS = [
  process.env.PDF_FONT_PATH,
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
].filter((fontPath): fontPath is string => Boolean(fontPath))

function formatDate(value?: Date | string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
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
  options: PDFKit.Mixins.TextOptions = {}
) {
  doc.rect(x, y, width, height).stroke()
  doc.text(text, x + 6, y + 8, { width: width - 12, height: height - 12, ...options })
}

async function renderDeliveryNotePdf(shipment: any, settings: SystemSettings) {
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
    doc.text(`销售订单：${shipment.salesOrder?.orderNo || '历史单据'}`, left, 242)
    doc.text(`客户订单号：${shipment.salesOrder?.voucherNo || shipment.voucherNo || '-'}`, left + 220, 242)
    doc.text(`发货库位：${shipment.location ? `${shipment.location.code} · ${shipment.location.name}` : '默认库位'}`, left + 390, 242)

    const tableTop = 264
    const headerHeight = 34
    const rowHeight = 44
    const widths = [48, 100, 150, 54, 66, 81]
    const headers = ['序号', '物料编码', '物料名称', '数量', '单价', '金额']
    let x = left
    doc.fontSize(10)
    headers.forEach((header, index) => {
      drawCell(doc, header, x, tableTop, widths[index], headerHeight, { align: 'center' })
      x += widths[index]
    })

    x = left
    const values = [
      '1',
      displayMaterialCode(shipment.material?.code || shipment.product.sku),
      `${shipment.material?.name || shipment.product.name}${shipment.material?.spec ? ` ${shipment.material.spec}` : ''}`,
      `${shipment.qty} ${shipment.material?.stockUnit || shipment.product.unit || ''}`.trim(),
      money(Number(shipment.unitPrice)),
      money(Number(shipment.totalAmount)),
    ]
    values.forEach((value, index) => {
      drawCell(doc, value, x, tableTop + headerHeight, widths[index], rowHeight, {
        align: index === 2 ? 'left' : 'center',
      })
      x += widths[index]
    })

    const totalY = tableTop + headerHeight + rowHeight
    drawCell(doc, '合计', left, totalY, widths.slice(0, 5).reduce((sum, width) => sum + width, 0), 34, { align: 'right' })
    drawCell(doc, money(Number(shipment.totalAmount)), left + widths.slice(0, 5).reduce((sum, width) => sum + width, 0), totalY, widths[5], 34, { align: 'center' })

    const noteY = totalY + 58
    doc.fontSize(10).text(`物流单号：${shipment.trackingNo || '-'}`, left, noteY)
    doc.text(`备注：${shipment.note || '-'}`, left, noteY + 24, { width: tableWidth })

    const signY = noteY + 92
    doc.text('乙方发货人：____________', left, signY)
    doc.text('甲方收货人：____________', left + 210, signY)
    doc.text('签收日期：______________', left + 390, signY)

    doc.fontSize(8).fillColor('#666666')
    doc.text('本发货单由 MES-lite 系统生成，用于双方发货交接、签收和对账留存。', left, doc.page.height - 72, {
      align: 'center',
      width: tableWidth,
    })

    doc.end()
  })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const denied = await requireResourcePermission('shipment', 'read')
    if (denied) return denied

    const [shipment, settings] = await Promise.all([
      prisma.shipment.findUnique({
        where: { id: params.id },
        include: {
          product: { select: { sku: true, name: true, unit: true } },
          material: { select: { code: true, name: true, spec: true, stockUnit: true } },
          location: { select: { code: true, name: true } },
          customerRef: { select: { phone: true, address: true } },
          salesOrder: { select: { orderNo: true, voucherNo: true } },
        },
      }),
      getSystemSettings(),
    ])

    if (!shipment) {
      return NextResponse.json({ error: '发货单不存在' }, { status: 404 })
    }

    if (!['SHIPPED', 'DELIVERED'].includes(shipment.status)) {
      return NextResponse.json({ error: '确认发货后才能下载发货单 PDF' }, { status: 400 })
    }
    if (!settings.companyName.trim()) return NextResponse.json({ error: '请先在系统设置填写发货单乙方企业名称' }, { status: 400 })

    const pdf = await renderDeliveryNotePdf(shipment, settings)
    const filename = encodeURIComponent(`发货单-${shipment.shipmentNo}.pdf`)

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Generate shipment PDF error:', error)
    return NextResponse.json({ error: '生成发货单 PDF 失败' }, { status: 500 })
  }
}
