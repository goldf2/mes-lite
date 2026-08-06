import assert from 'node:assert/strict'
import {
  MAX_ATTACHMENT_FILE_SIZE,
  attachmentPreviewKind,
  attachmentTypeLabel,
  canGenerateAttachmentThumbnail,
  normalizeAttachmentMimeType,
  shouldServeAttachmentInline,
} from '../lib/attachment-file-types'

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
assert.equal(canGenerateAttachmentThumbnail('training.pptx', ''), true)
assert.equal(shouldServeAttachmentInline('unsafe.svg', 'image/svg+xml'), false)
assert.equal(shouldServeAttachmentInline('readme.txt', 'text/plain'), true)

console.log('attachment file type verification passed')
