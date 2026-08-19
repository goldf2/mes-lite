import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MAX_ATTACHMENT_FILE_SIZE,
  attachmentPreviewKind,
  attachmentPreviewHint,
  attachmentTypeLabel,
  canGenerateAttachmentThumbnail,
  isSpreadsheetAttachment,
  normalizeAttachmentMimeType,
  shouldServeAttachmentInline,
} from '../lib/attachment-file-types'
import { officePreviewConversionFormat } from '../lib/office-document-preview'
import { buildPageFallbackSections, buildPdfSections } from '../modules/attachments/model/pdf-navigation'

assert.equal(MAX_ATTACHMENT_FILE_SIZE, 50 * 1024 * 1024)

const cases = [
  ['drawing.jpg', 'image/jpeg', 'image'],
  ['manual.pdf', 'application/pdf', 'pdf'],
  ['instruction.doc', 'application/msword', 'office'],
  ['instruction.docx', 'application/octet-stream', 'office'],
  ['ledger.xls', 'application/vnd.ms-excel', 'office'],
  ['ledger.xlsx', '', 'office'],
  ['training.ppt', 'application/vnd.ms-powerpoint', 'office'],
  ['training.pptx', 'application/octet-stream', 'office'],
  ['readme.txt', 'text/plain', 'text'],
  ['archive.zip', 'application/zip', 'none'],
] as const

for (const [fileName, mimeType, expected] of cases) {
  assert.equal(attachmentPreviewKind(fileName, mimeType), expected, fileName)
}

assert.equal(
  normalizeAttachmentMimeType('instruction.docx', 'application/octet-stream'),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
)
assert.equal(attachmentTypeLabel('ledger.xlsx', ''), 'XLSX')
assert.equal(isSpreadsheetAttachment('ledger.xlsx', ''), true)
assert.equal(isSpreadsheetAttachment('legacy.xls', 'application/octet-stream'), true)
assert.equal(isSpreadsheetAttachment('document.docx', 'application/octet-stream'), false)
assert.match(attachmentPreviewHint('ledger.xlsx', '') || '', /直接打开/)
assert.match(
  officePreviewConversionFormat('ledger.xlsx', ''),
  /calc_pdf_Export.*SinglePageSheets/,
  '表格预览必须忽略打印区域并把每张工作表完整导出为一页',
)
assert.equal(officePreviewConversionFormat('manual.docx', ''), 'pdf')
assert.equal(canGenerateAttachmentThumbnail('training.pptx', ''), true)
assert.equal(shouldServeAttachmentInline('unsafe.svg', 'image/svg+xml'), false)
assert.equal(shouldServeAttachmentInline('readme.txt', 'text/plain'), true)

assert.deepEqual(buildPdfSections([
  { title: ' Sheet A ', pageNumber: 1 },
  { title: 'Sheet B', pageNumber: 3 },
  { title: 'duplicate destination', pageNumber: 3 },
], 5), [
  { title: 'Sheet A', pageNumber: 1, endPageNumber: 2 },
  { title: 'Sheet B', pageNumber: 3, endPageNumber: 5 },
])
assert.deepEqual(buildPageFallbackSections(2), [
  { title: '第 1 页', pageNumber: 1, endPageNumber: 1 },
  { title: '第 2 页', pageNumber: 2, endPageNumber: 2 },
])

const documentViewerSource = readFileSync(join(process.cwd(), 'modules/attachments/ui/DocumentFileViewer.tsx'), 'utf8')
const pdfViewerSource = readFileSync(join(process.cwd(), 'modules/attachments/ui/PdfDocumentViewer.tsx'), 'utf8')
assert.match(documentViewerSource, /SpreadsheetDocumentViewer/, '公共文件查看器必须直接打开表格附件')
assert.match(pdfViewerSource, /getOutline\(\)/, '表格预览必须读取 PDF 工作表目录')
assert.match(pdfViewerSource, /visiblePages\.map/, '表格预览必须只渲染当前工作表页范围')

const officePreviewSource = readFileSync(join(process.cwd(), 'lib/office-document-preview.ts'), 'utf8')
assert.match(officePreviewSource, /previewVersion = 2/, '完整工作表导出必须失效旧版裁切 PDF 缓存')

console.log('attachment file type verification passed')
