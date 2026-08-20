import type { AttachmentPreviewKind } from '@/lib/attachment-file-types'

export interface DocumentCategoryRecord {
  id: string
  name: string
  parentId?: string | null
  parent?: { id: string; name: string } | null
  sortOrder: number
  _count: { children: number; workInstructions: number }
}

export interface CustomerOption {
  id: string
  code: string
  name: string
}

export interface MaterialOption {
  id: string
  code: string
  name: string
  spec?: string | null
  category?: string
  customerId?: string | null
  customer?: CustomerOption | null
}

export interface WorkCenterOption {
  id: string
  code: string
  name: string
  isActive: boolean
}

export interface AttachmentItem {
  id: string
  originalName: string
  mimeType: string
  size: number
  url: string
  thumbnailUrl?: string | null
  previewUrl?: string | null
  previewKind?: AttachmentPreviewKind
  note?: string | null
  documentType: string
  isCover: boolean
  rotation: number
  previewRevision?: number
  createdAt: string
}

export interface WorkInstruction {
  id: string
  categoryId: string
  category: Pick<DocumentCategoryRecord, 'id' | 'name' | 'parentId' | 'parent'>
  title: string
  version: string
  status: string
  materialId?: string | null
  material?: MaterialOption | null
  workCenters: WorkCenterOption[]
  contentJson?: string | null
  contentText?: string | null
  note?: string | null
  attachmentCount: number
  imageCount: number
  pdfCount: number
  primaryAttachment?: AttachmentItem | null
  createdAt: string
  updatedAt: string
}

export interface PaginationState {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface WorkInstructionForm {
  title: string
  categoryId: string
  version: string
  status: string
  materialId: string
  workCenterIds: string[]
  contentJson: string
  note: string
}

export interface WorkInstructionSaveInput {
  title: string
  materialId: string | null
  categoryId: string
  version: string
  status: string
  workCenterIds: string[]
  contentJson: string
  note?: string
}
