export type MaterialImportMode = 'skip' | 'update'

export type MaterialImportCell = string | number | boolean | null
export interface MaterialImportField {
  key: string
  label: string
  aliases: string[]
  type: 'text' | 'number' | 'boolean' | 'list'
  required?: boolean
  hint?: string
}
export interface MaterialImportOptions {
  worksheet?: string
  headerRow?: number
  /** Target field -> zero-based source column; null explicitly disables auto-mapping. */
  mapping?: Record<string, number | null>
  defaults?: Record<string, MaterialImportCell>
  mode?: MaterialImportMode
}
export interface MaterialImportUpload {
  name: string
  bytes: Uint8Array
  options: MaterialImportOptions
}
export interface MaterialImportRowPreview {
  rowNumber: number
  code: string
  name: string
  action: 'new' | 'update' | 'skip' | 'error'
  errors: string[]
  warnings: string[]
  values: Record<string, unknown>
}
export interface MaterialImportPreview {
  worksheets: Array<{ name: string; rows: number; columns: number }>
  worksheet: string
  headerRow: number
  columns: Array<{ index: number; name: string; samples?: MaterialImportCell[] }>
  fields: MaterialImportField[]
  mapping: Record<string, number | null>
  ignoredColumns: Array<{ index: number; name: string }>
  warnings: string[]
  rows: MaterialImportRowPreview[]
  /** Full-file totals; rows contains at most 100 samples, prioritizing errors. */
  summary: { total: number; new: number; update: number; skip: number; error: number; warnings: number }
  canCommit: boolean
}

export interface ImportCustomer {
  id: string
  code: string
  name: string
}

export interface ImportMaterial {
  rowNumber: number
  code: string
  name: string
  spec: string
  note: string
  category: string
  customerName: string
  customerId: string | null
  primaryMeasure: string
  referenceMeasure: string | null
  stockUnit: string
  valuationUnit: string
  conversionRate: number
  conversionNote: string
  costingMethod: string
  defaultSalePrice: number | null
  salesCurrency: string
}

export interface MaterialImportSummary {
  total: number
  created: number
  updated: number
  skipped: number
  customersCreated: number
}
