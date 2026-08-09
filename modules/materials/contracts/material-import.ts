export type MaterialImportMode = 'skip' | 'update'

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
