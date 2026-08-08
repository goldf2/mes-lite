import fs from 'node:fs'
import PDFDocument from 'pdfkit'
import type { SystemSettings } from '@/lib/system-settings'

export interface BusinessDocumentColumn {
  label: string
  key: string
  width: number
  align?: 'left' | 'center' | 'right'
}

export interface BusinessDocumentPrintData {
  title: string
  documentNo: string
  status: string
  documentDate: string
  referenceNo?: string | null
  partyLabel?: string
  partyName?: string | null
  summaryFields?: Array<{ label: string; value: string }>
  columns: BusinessDocumentColumn[]
  rows: Array<Record<string, string>>
  totalLabel?: string
  totalValue?: string
  note?: string | null
  signatures?: string[]
}

const FONT_PATHS = [
  process.env.PDF_FONT_PATH,
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
].filter((fontPath): fontPath is string => Boolean(fontPath))

function drawCell(
  pdf: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  align: 'left' | 'center' | 'right' = 'left',
) {
  pdf.rect(x, y, width, height).stroke('#cbd5e1')
  pdf.fillColor('#111827').text(text || '-', x + 5, y + 7, {
    width: width - 10,
    height: height - 10,
    align,
    ellipsis: true,
  })
}

export function renderBusinessDocumentPdf(
  data: BusinessDocumentPrintData,
  settings: SystemSettings,
) {
  return new Promise<Buffer>((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true })
    const chunks: Buffer[] = []
    pdf.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    pdf.on('end', () => resolve(Buffer.concat(chunks)))
    pdf.on('error', reject)

    const fontPath = FONT_PATHS.find((candidate) => fs.existsSync(candidate))
    if (fontPath) {
      pdf.registerFont('main', fontPath)
      pdf.font('main')
    }

    const left = 42
    const pageWidth = pdf.page.width - 84
    const companyName = settings.companyName.trim() || 'MES-lite'

    pdf.fontSize(10).fillColor('#475569').text(companyName, left, 40, { width: pageWidth, align: 'center' })
    pdf.fontSize(22).fillColor('#111827').text(data.title, left, 59, { width: pageWidth, align: 'center' })
    pdf.moveTo(left, 92).lineTo(left + pageWidth, 92).stroke('#94a3b8')

    pdf.fontSize(9).fillColor('#334155')
    pdf.text(`单据编号：${data.documentNo}`, left, 106, { width: pageWidth / 2 })
    pdf.text(`单据状态：${data.status}`, left + pageWidth / 2, 106, { width: pageWidth / 2, align: 'right' })
    pdf.text(`单据日期：${data.documentDate}`, left, 124, { width: pageWidth / 2 })
    pdf.text(`外部凭据：${data.referenceNo || '-'}`, left + pageWidth / 2, 124, { width: pageWidth / 2, align: 'right' })

    let cursorY = 151
    if (data.partyLabel || data.partyName) {
      pdf.roundedRect(left, cursorY, pageWidth, 30, 4).fillAndStroke('#f8fafc', '#cbd5e1')
      pdf.fillColor('#334155').fontSize(9).text(`${data.partyLabel || '往来方'}：${data.partyName || '-'}`, left + 9, cursorY + 9, { width: pageWidth - 18 })
      cursorY += 42
    }

    if (data.summaryFields?.length) {
      const fieldWidth = pageWidth / Math.min(3, data.summaryFields.length)
      const fieldRows = Math.ceil(data.summaryFields.length / 3)
      data.summaryFields.forEach((field, index) => {
        const column = index % 3
        const row = Math.floor(index / 3)
        pdf.fontSize(8).fillColor('#64748b').text(field.label, left + column * fieldWidth, cursorY + row * 30, { width: fieldWidth - 8 })
        pdf.fontSize(9).fillColor('#111827').text(field.value || '-', left + column * fieldWidth, cursorY + row * 30 + 12, { width: fieldWidth - 8, ellipsis: true })
      })
      cursorY += fieldRows * 30 + 10
    }

    const totalWeight = data.columns.reduce((sum, column) => sum + column.width, 0)
    const columnWidths = data.columns.map((column) => pageWidth * column.width / totalWeight)
    const headerHeight = 30
    const rowHeight = 38

    const drawHeader = () => {
      let x = left
      pdf.fontSize(9)
      data.columns.forEach((column, index) => {
        pdf.rect(x, cursorY, columnWidths[index], headerHeight).fillAndStroke('#eef2f7', '#cbd5e1')
        pdf.fillColor('#334155').text(column.label, x + 5, cursorY + 9, { width: columnWidths[index] - 10, align: column.align || 'center' })
        x += columnWidths[index]
      })
      cursorY += headerHeight
    }

    drawHeader()
    data.rows.forEach((row, rowIndex) => {
      if (cursorY + rowHeight > pdf.page.height - 118) {
        pdf.addPage()
        cursorY = 48
        drawHeader()
      }
      let x = left
      pdf.fontSize(8)
      data.columns.forEach((column, columnIndex) => {
        drawCell(pdf, row[column.key] || '-', x, cursorY, columnWidths[columnIndex], rowHeight, column.align || (columnIndex === 0 ? 'center' : 'left'))
        x += columnWidths[columnIndex]
      })
      cursorY += rowHeight
      if (rowIndex === data.rows.length - 1 && data.totalValue) {
        const labelWidth = columnWidths.slice(0, -1).reduce((sum, width) => sum + width, 0)
        drawCell(pdf, data.totalLabel || '合计', left, cursorY, labelWidth, 30, 'right')
        drawCell(pdf, data.totalValue, left + labelWidth, cursorY, columnWidths.at(-1) || 0, 30, 'right')
        cursorY += 30
      }
    })

    cursorY += 18
    pdf.fontSize(9).fillColor('#334155').text(`备注：${data.note || '-'}`, left, cursorY, { width: pageWidth })
    cursorY += 48
    const signatures = data.signatures?.length ? data.signatures : ['制单人', '审核人', '经办人']
    const signatureWidth = pageWidth / signatures.length
    signatures.forEach((signature, index) => {
      pdf.text(`${signature}：____________`, left + signatureWidth * index, cursorY, { width: signatureWidth })
    })

    const pageRange = pdf.bufferedPageRange()
    for (let index = 0; index < pageRange.count; index += 1) {
      pdf.switchToPage(pageRange.start + index)
      pdf.fontSize(7).fillColor('#64748b').text(
        `由 MES-lite 生成 · ${new Date().toLocaleString('zh-CN', { hour12: false })} · 第 ${index + 1}/${pageRange.count} 页`,
        left,
        pdf.page.height - 42,
        { width: pageWidth, align: 'center' },
      )
    }

    pdf.end()
  })
}
