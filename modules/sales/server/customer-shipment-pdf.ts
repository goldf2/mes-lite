import fs from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'

export interface CustomerShipmentPrintData {
  shipmentNo: string
  shippedAt: string
  customer: string
  customerContact: string
  customerPhone: string
  address: string
  companyName: string
  companyContact: string
  companyPhone: string
  companyAddress: string
  voucherNo: string
  trackingNo: string
  note: string
  rows: string[][]
  total: string
  packages: string
}

const mm = (value: number) => value * 72 / 25.4
export const customerShipmentPapers = ['continuous', 'a4'] as const
export type CustomerShipmentPaper = typeof customerShipmentPapers[number]
export const customerShipmentPaperSizes = { continuous: [241, 140], a4: [210, 297] } as const
// 正文限制在 A4 的常用可打印宽度内，两种纸型均按实际大小居中打印。
const contentWidth = mm(190)
const top = mm(6)
const fontSize = 9
const lineHeight = 12
const cellPadding = 4
const headerHeight = 20
const widths = [30, 106, contentWidth - 376, 76, 80, 84]
const headers = ['序号', '物料编码', '物料名称/规格', '数量', '单价', '金额']

const fontPaths = [
  process.env.PDF_FONT_PATH,
  path.join(process.cwd(), 'assets/fonts/NotoSansCJKsc-Regular.otf'),
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
].filter((fontPath): fontPath is string => Boolean(fontPath))

/** 手动折行与分页共用实际字体宽度，避免 PDFKit 隐式换页或省略客户内容。 */
function wrapLines(doc: PDFKit.PDFDocument, value: string, width: number) {
  const lines: string[] = []
  for (const paragraph of String(value).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
    let line = ''
    for (const character of paragraph) {
      if (line && doc.widthOfString(line + character) > width) {
        lines.push(line)
        line = character
      } else {
        line += character
      }
    }
    lines.push(line)
  }
  return lines
}

export async function renderCustomerShipmentPdf(data: CustomerShipmentPrintData, downloadUrl: string, paper: CustomerShipmentPaper = 'continuous') {
  const dimensions = customerShipmentPaperSizes[paper]
  const paperSize: [number, number] = [mm(dimensions[0]), mm(dimensions[1])]
  const left = (paperSize[0] - contentWidth) / 2
  const contentBottom = paperSize[1] - mm(12)
  const qrCode = await QRCode.toBuffer(downloadUrl, {
    errorCorrectionLevel: 'M', margin: 4, width: 360,
    color: { dark: '#000000', light: '#ffffff' },
  })
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: paperSize, margin: 0, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    const fontPath = fontPaths.find((candidate) => fs.existsSync(candidate))
    if (fontPath) doc.registerFont('main', fontPath).font('main')
    doc.lineWidth(0.5).fillColor('black').strokeColor('black')

    const textLine = (text: string, x: number, y: number, width: number, align: PDFKit.Mixins.TextOptions['align'] = 'left') => {
      doc.text(text, x, y, { width, align, lineBreak: false })
    }
    const headingWidth = contentWidth - 96
    const pageCounters: Array<{ y: number; width: number }> = []
    const drawContinuationHeader = () => {
      doc.fontSize(fontSize)
      const lines = wrapLines(doc, `发货单号：${data.shipmentNo}`, contentWidth - 96)
      lines.forEach((line, index) => textLine(line, left, top + index * lineHeight, contentWidth - 96))
      pageCounters.push({ y: top, width: contentWidth })
      return top + Math.max(22, lines.length * lineHeight + 8)
    }
    const drawPageHeader = () => {
      doc.lineWidth(0.5).fillColor('black').strokeColor('black')
      if (pageCounters.length > 0) return drawTableHeader(drawContinuationHeader())
      doc.fontSize(15)
      textLine('客户发货单', left, top, contentWidth, 'center')
      const qrLeft = left + contentWidth - 70
      doc.image(qrCode, qrLeft + 3, top, { width: 64, height: 64 })
      doc.fontSize(7)
      textLine('如需电子档，请扫描', qrLeft, top + 66, 70, 'center')
      textLine('二维码获取', qrLeft, top + 76, 70, 'center')
      pageCounters.push({ y: top + 4, width: headingWidth })
      let headingY = top + 23
      doc.fontSize(fontSize)
      for (const line of wrapLines(doc, `发货单号：${data.shipmentNo}    发货时间：${data.shippedAt}`, headingWidth)) {
        textLine(line, left, headingY, headingWidth)
        headingY += lineHeight
      }
      headingY += 5
      const partyGap = 12
      const partyWidth = (headingWidth - partyGap) / 2
      const parties = [
        [`收货方：${data.customer}`, `收货联系人：${data.customerContact}`, `收货电话：${data.customerPhone}`, `收货地址：${data.address}`],
        [`供货方：${data.companyName}`, `供货联系人：${data.companyContact}`, `供货电话：${data.companyPhone}`, `供货地址：${data.companyAddress}`],
      ].map((fields) => fields.flatMap((text) => wrapLines(doc, text, partyWidth)))
      for (let index = 0; index < Math.max(...parties.map((lines) => lines.length)); index += 1) {
        // 两栏各自折行、共同推进；极长一方资料仍在明细之前完整续页。
        if (headingY + lineHeight > contentBottom - headerHeight - 46) {
          doc.addPage()
          headingY = drawContinuationHeader()
        }
        parties.forEach((lines, column) => {
          if (index < lines.length) textLine(lines[index], left + column * (partyWidth + partyGap), headingY, partyWidth)
        })
        headingY += lineHeight
      }
      return drawTableHeader(Math.max(headingY + 6, pageCounters.length === 1 ? top + 90 : 0))
    }
    const drawTableHeader = (tableTop: number) => {
      doc.fontSize(fontSize)
      let x = left
      headers.forEach((header, index) => {
        doc.rect(x, tableTop, widths[index], headerHeight).stroke()
        textLine(header, x + cellPadding, tableTop + cellPadding, widths[index] - cellPadding * 2, 'center')
        x += widths[index]
      })
      return tableTop + headerHeight
    }
    let cursorY = drawPageHeader()
    let pageBodyTop = cursorY
    const nextPage = () => {
      doc.addPage()
      cursorY = drawPageHeader()
      pageBodyTop = cursorY
    }
    const totalHeight = 20
    const signatureHeight = 24
    const details = [
      ['备注', data.note],
      ['客户凭证号', `${data.voucherNo}    物流单号：${data.trackingNo}`],
      ['包裹', data.packages],
    ].map(([label, value]) => ({ label, lines: wrapLines(doc, `${label}：${value}`, contentWidth - cellPadding * 2) }))
    const tailHeight = totalHeight + 6 + details.reduce((sum, detail) => sum + detail.lines.length * lineHeight, 0) + signatureHeight

    for (let rowIndex = 0; rowIndex < data.rows.length; rowIndex += 1) {
      const values = data.rows[rowIndex]
      doc.fontSize(fontSize)
      const cells = widths.map((width, index) => wrapLines(doc, values[index] || '-', width - cellPadding * 2))
      const lines = Math.max(...cells.map((cell) => cell.length))
      const fullHeight = Math.max(20, lines * lineHeight + cellPadding * 2)
      // 短收尾区与最后一条明细一起移页，避免另打一张只有合计/签字的纸。
      const lastRow = rowIndex === data.rows.length - 1
      const requiredHeight = lastRow
        ? fullHeight + (fullHeight + tailHeight <= contentBottom - pageBodyTop ? tailHeight : totalHeight)
        : fullHeight
      // 普通明细整行移至下一页；只有单行本身超过一整页时才拆成带“续”的片段。
      if (cursorY > pageBodyTop && cursorY + requiredHeight > contentBottom) nextPage()
      let offset = 0
      while (offset < lines) {
        const availableLines = Math.floor((contentBottom - cursorY - cellPadding * 2) / lineHeight)
        if (availableLines < 1) {
          nextPage()
          continue
        }
        let count = Math.min(lines - offset, availableLines)
        if (lastRow && count === lines - offset) {
          const availableWithTotal = Math.floor((contentBottom - cursorY - cellPadding * 2 - totalHeight) / lineHeight)
          if (availableWithTotal < 1) {
            nextPage()
            continue
          }
          count = Math.min(count, availableWithTotal)
        }
        const height = Math.max(20, count * lineHeight + cellPadding * 2)
        let x = left
        cells.forEach((cell, column) => {
          doc.rect(x, cursorY, widths[column], height).stroke()
          const fragment = column === 0 && offset > 0 ? [`${values[0]}续`] : cell.slice(offset, offset + count)
          const align = column === 0 ? 'center' : column >= 3 ? 'right' : 'left'
          fragment.forEach((line, index) => textLine(line, x + cellPadding, cursorY + cellPadding + index * lineHeight, widths[column] - cellPadding * 2, align))
          x += widths[column]
        })
        cursorY += height
        offset += count
        if (offset < lines) nextPage()
      }
    }

    // 合计直接承接最后一条明细，底部资料区不打断明细与合计。
    doc.rect(left, cursorY, contentWidth, totalHeight).stroke()
    doc.fontSize(10)
    textLine(`合计：${data.total}`, left + 6, cursorY + 3, contentWidth - 12, 'right')
    cursorY += totalHeight
    cursorY += 6
    doc.fontSize(fontSize)
    let remainingDetailLines = details.reduce((sum, detail) => sum + detail.lines.length, 0)
    for (const { label, lines } of details) {
      for (let index = 0; index < lines.length; index += 1) {
        if (cursorY + lineHeight + (remainingDetailLines === 1 ? signatureHeight : 0) > contentBottom) {
          nextPage()
          if (index > 0) {
            cursorY = Math.max(cursorY, contentBottom - (remainingDetailLines + 1) * lineHeight - signatureHeight)
            textLine(`${label}（续）：`, left + cellPadding, cursorY, contentWidth - cellPadding * 2)
            cursorY += lineHeight
          }
        }
        // 能容纳的末段整体贴底；备注增加行数时向上扩展，超长内容仍按序续页。
        cursorY = Math.max(cursorY, contentBottom - remainingDetailLines * lineHeight - signatureHeight)
        textLine(lines[index], left + cellPadding, cursorY, contentWidth - cellPadding * 2)
        cursorY += lineHeight
        remainingDetailLines -= 1
      }
    }

    // 签收栏固定在末页底部，长备注不改变签字位置。
    if (cursorY + signatureHeight > contentBottom) nextPage()
    doc.fontSize(fontSize)
    const signatureWidth = contentWidth / 3
    const signatures = ['乙方发货人', '甲方收货人', '签收日期']
    signatures.forEach((label, index) => {
      textLine(`${label}：____________`, left + index * signatureWidth, contentBottom - signatureHeight + 8, signatureWidth)
    })

    const range = doc.bufferedPageRange()
    for (let index = 0; index < range.count; index += 1) {
      doc.switchToPage(range.start + index)
      doc.fontSize(8)
      const footerY = paperSize[1] - mm(8)
      if (index === range.count - 1) textLine('本单用于发货交接、签收和对账', left, footerY, contentWidth)
      textLine(`第 ${index + 1}/${range.count} 页`, left, pageCounters[index].y, pageCounters[index].width, 'right')
    }
    doc.end()
  })
}
