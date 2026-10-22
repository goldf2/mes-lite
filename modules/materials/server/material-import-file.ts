import ExcelJS from 'exceljs'
import { parseCsv } from '@/lib/csv'
import type { MaterialImportCell, MaterialImportUpload } from '../contracts/material-import'

export const materialImportLimits = { bytes: 10 * 1024 * 1024, rows: 10000, columns: 200, sheets: 30, expandedBytes: 64 * 1024 * 1024 }
export class MaterialImportError extends Error {
  constructor(message: string, public readonly details?: string[]) { super(message); this.name = 'MaterialImportError' }
}
export interface MaterialImportSheet {
  worksheets: Array<{ name: string; rows: number; columns: number }>
  worksheet: string
  rows: MaterialImportCell[][]
  invalidCells: Map<string, string>
}
function assertShape(rows: number, columns: number) {
  if (rows > materialImportLimits.rows + 50) throw new MaterialImportError(`工作表不能超过 ${materialImportLimits.rows} 行数据（另允许 50 行表头说明）`)
  if (columns > materialImportLimits.columns) throw new MaterialImportError(`工作表不能超过 ${materialImportLimits.columns} 列`)
}
/** Bound ZIP expansion before ExcelJS loads it; ZIP64 archives are deliberately unsupported. */
function assertXlsxArchiveBounds(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes)
  let end = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break }
  }
  if (end < 0) throw new MaterialImportError('XLSX 文件损坏或格式无效')
  const count = buffer.readUInt16LE(end + 10)
  let offset = buffer.readUInt32LE(end + 16)
  let expanded = 0
  if (count > 2000 || count === 65535) throw new MaterialImportError('XLSX 压缩包条目过多')
  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw new MaterialImportError('XLSX 压缩包目录无效')
    const size = buffer.readUInt32LE(offset + 24)
    expanded += size
    if (size === 0xffffffff || expanded > materialImportLimits.expandedBytes) throw new MaterialImportError('XLSX 解压后内容过大（上限 64MB）')
    offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32)
  }
}
export async function readMaterialImportFile(input: MaterialImportUpload): Promise<MaterialImportSheet> {
  if (!input.bytes.length) throw new MaterialImportError('上传文件不能为空')
  if (input.bytes.length > materialImportLimits.bytes) throw new MaterialImportError('文件不能超过 10MB')
  const extension = input.name.toLowerCase().split('.').pop()
  if (extension === 'csv') {
    let text: string
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(input.bytes) } catch { throw new MaterialImportError('CSV 必须使用 UTF-8 编码，请另存为 UTF-8 CSV') }
    let quoted = false
    let physicalLines = 1
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === '\n' && ++physicalLines > 100000) throw new MaterialImportError('CSV 物理行数过多')
      if (text[index] === '"') {
        if (quoted && text[index + 1] === '"') index += 1
        else quoted = !quoted
      }
    }
    if (quoted) throw new MaterialImportError('CSV 引号未闭合，请检查文件格式')
    const rows = parseCsv(text)
    assertShape(rows.length, 0)
    const width = rows.reduce((max,row) => Math.max(max,row.length),0)
    assertShape(rows.length, width)
    if (input.options.worksheet && input.options.worksheet !== 'CSV') throw new MaterialImportError('CSV 只有一个工作表 CSV')
    return { worksheets: [{ name: 'CSV', rows: rows.length, columns: width }], worksheet: 'CSV', rows, invalidCells: new Map() }
  }
  if (extension !== 'xlsx') throw new MaterialImportError('仅支持 .xlsx 和 UTF-8 .csv 文件')
  assertXlsxArchiveBounds(input.bytes)
  const workbook = new ExcelJS.Workbook()
  try { await workbook.xlsx.load(Buffer.from(input.bytes) as never) } catch { throw new MaterialImportError('无法读取 XLSX 文件，请检查格式或取消文件加密') }
  if (!workbook.worksheets.length || workbook.worksheets.length > materialImportLimits.sheets) throw new MaterialImportError('工作簿须包含 1–30 个工作表')
  const worksheet = input.options.worksheet ? workbook.getWorksheet(input.options.worksheet) : workbook.worksheets[0]
  if (!worksheet) throw new MaterialImportError('选择的工作表不存在')
  assertShape(worksheet.rowCount, worksheet.columnCount)
  const invalidCells = new Map<string, string>()
  const rows: MaterialImportCell[][] = []
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row: MaterialImportCell[] = []
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      const cell = worksheet.getCell(rowNumber, column)
      const value = cell.value
      if (value === null || value === undefined) row.push(null)
      else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') row.push(value)
      else if (typeof value === 'object' && 'richText' in value) row.push(value.richText.map((part) => part.text).join(''))
      else {
        row.push(cell.text || '')
        invalidCells.set(`${rowNumber}:${column - 1}`, '不支持公式、日期或错误值，请先粘贴为文本/数值')
      }
    }
    rows.push(row)
  }
  return {
    worksheets: workbook.worksheets.map((sheet) => ({ name: sheet.name, rows: sheet.rowCount, columns: sheet.columnCount })),
    worksheet: worksheet.name, rows, invalidCells,
  }
}
