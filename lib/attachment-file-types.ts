export const MAX_ATTACHMENT_FILE_SIZE = 50 * 1024 * 1024

export type AttachmentPreviewKind = 'image' | 'pdf' | 'office' | 'text' | 'none'

const officeExtensions = new Set([
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp',
])

export const officeAttachmentMimeTypes = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
] as const

const officeMimeTypes = new Set<string>(officeAttachmentMimeTypes)
const spreadsheetExtensions = new Set(['.xls', '.xlsx', '.ods'])
const spreadsheetMimeTypes = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
])

const textExtensions = new Set(['.txt', '.md', '.csv', '.tsv', '.json', '.xml', '.log'])

const extensionMimeTypes: Record<string, string> = {
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.log': 'text/plain',
}

export function attachmentExtension(fileName: string) {
  const normalized = fileName.trim().toLowerCase()
  const dotIndex = normalized.lastIndexOf('.')
  return dotIndex > -1 ? normalized.slice(dotIndex) : ''
}

export function normalizeAttachmentMimeType(fileName: string, mimeType?: string | null) {
  const normalized = mimeType?.trim().toLowerCase()
  if (normalized && normalized !== 'application/octet-stream') return normalized
  return extensionMimeTypes[attachmentExtension(fileName)] || 'application/octet-stream'
}

export function attachmentPreviewKind(fileName: string, mimeType?: string | null): AttachmentPreviewKind {
  const normalizedMimeType = normalizeAttachmentMimeType(fileName, mimeType)
  const extension = attachmentExtension(fileName)
  if (normalizedMimeType.startsWith('image/') && normalizedMimeType !== 'image/svg+xml') return 'image'
  if (normalizedMimeType === 'application/pdf' || extension === '.pdf') return 'pdf'
  if (officeMimeTypes.has(normalizedMimeType) || officeExtensions.has(extension)) return 'office'
  if (normalizedMimeType.startsWith('text/') || textExtensions.has(extension)) return 'text'
  if (['application/json', 'application/xml'].includes(normalizedMimeType)) return 'text'
  return 'none'
}

export function isSpreadsheetAttachment(fileName: string, mimeType?: string | null) {
  return spreadsheetExtensions.has(attachmentExtension(fileName))
    || spreadsheetMimeTypes.has(normalizeAttachmentMimeType(fileName, mimeType))
}

export function attachmentPreviewHint(fileName: string, mimeType?: string | null) {
  if (isSpreadsheetAttachment(fileName, mimeType)) {
    return 'Excel/ODS 工作簿通过 LibreOffice 在线查看器直接打开，可在原生工作表标签间切换。'
  }
  const kind = attachmentPreviewKind(fileName, mimeType)
  if (kind === 'pdf' || kind === 'office') {
    return '多页文档可纵向滚动；Office 文件首次打开时由服务器生成 PDF 预览，原文件保持不变。'
  }
  return null
}

export function attachmentTypeLabel(fileName: string, mimeType?: string | null) {
  const extension = attachmentExtension(fileName).replace('.', '').toUpperCase()
  const kind = attachmentPreviewKind(fileName, mimeType)
  if (kind === 'image') return '图片'
  if (kind === 'pdf') return 'PDF'
  if (kind === 'text') return extension || '文本'
  if (kind === 'office') return extension || 'Office'
  return extension || '文件'
}

export function canGenerateAttachmentThumbnail(fileName: string, mimeType?: string | null) {
  const kind = attachmentPreviewKind(fileName, mimeType)
  return kind === 'image' || kind === 'pdf' || kind === 'office'
}

export function shouldServeAttachmentInline(fileName: string, mimeType?: string | null) {
  const kind = attachmentPreviewKind(fileName, mimeType)
  return kind === 'image' || kind === 'pdf' || kind === 'text'
}
