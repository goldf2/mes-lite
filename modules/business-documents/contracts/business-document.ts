export const businessDocumentKinds = [
  'material-in',
  'sales-order',
  'shipment',
  'return',
  'flow-transfer',
  'production-order',
  'dispatch',
] as const

export type BusinessDocumentKind = typeof businessDocumentKinds[number]

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

export interface BusinessDocumentPdfResult {
  pdf: Buffer
  filename: string
}
