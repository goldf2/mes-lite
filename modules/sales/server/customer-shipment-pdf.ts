import fs from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'

export interface CustomerShipmentPrintData {
  shipmentNo: string
  shippedAt: string
  customer: string
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
const paperSize: [number, number] = [mm(241), mm(140)]
// 241 mm 包含两侧链孔，正文避开可撕边；不按物理联数重复生成 PDF 页。
const left = mm(13)
const top = mm(6)
const contentWidth = paperSize[0] - left * 2
const contentBottom = paperSize[1] - mm(12)
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

export async function renderCustomerShipmentPdf(data: CustomerShipmentPrintData, downloadUrl: string) {
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
    const drawPageHeader = () => {
      doc.lineWidth(0.5).fillColor('black').strokeColor('black')
      doc.fontSize(15)
      textLine('客户发货单', left, top, headingWidth, 'center')
      let headingY = top + 21
      doc.fontSize(fontSize)
      for (const text of [data.companyName, `发货单号：${data.shipmentNo}    发货时间：${data.shippedAt}`, `客户：${data.customer}    收货电话：${data.customerPhone}`]) {
        for (const line of wrapLines(doc, text, headingWidth)) {
          textLine(line, left, headingY, headingWidth)
          headingY += lineHeight
        }
      }
      const qrLeft = left + contentWidth - 70
      doc.image(qrCode, qrLeft + 3, top, { width: 64, height: 64 })
      doc.fontSize(7)
      textLine('如需电子档，请扫描', qrLeft, top + 66, 70, 'center')
      textLine('二维码获取', qrLeft, top + 76, 70, 'center')
      const tableTop = Math.max(headingY + 6, top + 91)
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

    for (const values of data.rows) {
      doc.fontSize(fontSize)
      const cells = widths.map((width, index) => wrapLines(doc, values[index] || '-', width - cellPadding * 2))
      const lines = Math.max(...cells.map((cell) => cell.length))
      const fullHeight = Math.max(22, lines * lineHeight + cellPadding * 2)
      // 普通明细整行移至下一页；只有单行本身超过一整页时才拆成带“续”的片段。
      if (cursorY > pageBodyTop && cursorY + fullHeight > contentBottom) nextPage()
      let offset = 0
      while (offset < lines) {
        const availableLines = Math.floor((contentBottom - cursorY - cellPadding * 2) / lineHeight)
        if (availableLines < 1) {
          nextPage()
          continue
        }
        const count = Math.min(lines - offset, availableLines)
        const height = Math.max(22, count * lineHeight + cellPadding * 2)
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

    cursorY += 6
    const details = [
      ['收货地址', data.address],
      ['供货联系人', `${data.companyContact}    电话：${data.companyPhone}`],
      ['供货地址', data.companyAddress],
      ['客户凭证号', `${data.voucherNo}    物流单号：${data.trackingNo}`],
      ['包裹', data.packages],
      ['备注', data.note],
    ]
    doc.fontSize(fontSize)
    for (const [label, value] of details) {
      const lines = wrapLines(doc, `${label}：${value}`, contentWidth - cellPadding * 2)
      for (let index = 0; index < lines.length; index += 1) {
        if (cursorY + lineHeight > contentBottom) {
          nextPage()
          if (index > 0) {
            textLine(`${label}（续）：`, left + cellPadding, cursorY, contentWidth - cellPadding * 2)
            cursorY += lineHeight
          }
        }
        textLine(lines[index], left + cellPadding, cursorY, contentWidth - cellPadding * 2)
        cursorY += lineHeight
      }
    }

    // 整单总额和签收栏作为一个不可拆分的末页区块，续页不出现误导性的整单合计。
    const closingHeight = 44
    if (cursorY + closingHeight > contentBottom) nextPage()
    const closingY = Math.max(cursorY + 4, contentBottom - closingHeight + 4)
    doc.rect(left, closingY, contentWidth, 20).stroke()
    const total = `合计：${data.total}`
    doc.fontSize(10)
    textLine(total, left + 6, closingY + 3, contentWidth - 12, 'right')
    doc.fontSize(fontSize)
    const signatureWidth = contentWidth / 3
    const signatures = ['乙方发货人', '甲方收货人', '签收日期']
    signatures.forEach((label, index) => {
      textLine(`${label}：____________`, left + index * signatureWidth, closingY + 28, signatureWidth)
    })

    const range = doc.bufferedPageRange()
    for (let index = 0; index < range.count; index += 1) {
      doc.switchToPage(range.start + index)
      doc.fontSize(8)
      const footerY = paperSize[1] - mm(8)
      textLine(index < range.count - 1 ? '接下页' : '本单用于发货交接、签收和对账', left, footerY, contentWidth * 0.7)
      textLine(`第 ${index + 1}/${range.count} 页`, left, footerY, contentWidth, 'right')
    }
    doc.end()
  })
}
