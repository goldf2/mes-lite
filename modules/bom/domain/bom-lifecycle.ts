export const BOM_STATUSES = ['DRAFT', 'RELEASED', 'OBSOLETE'] as const

export type BomStatus = (typeof BOM_STATUSES)[number]

export const BOM_STATUS_LABELS: Record<BomStatus, string> = {
  DRAFT: '草稿',
  RELEASED: '已发布',
  OBSOLETE: '已作废',
}

export function isEditableBomStatus(status: string): status is 'DRAFT' {
  return status === 'DRAFT'
}
