export type QualityTaskFilter = 'PENDING' | 'DISPOSITION' | 'ALL'

export interface QualityTaskItem {
  id: string
  inspectionNo: string
  lotId: string
  sourceType: string
  sourceId: string
  round: number
  status: string
  result: string
  inspectedQty: number
  sampleQty: number
  goodQty: number
  badQty: number
  inspector: string | null
  checkedAt: string | null
  note: string | null
  createdAt: string
  standardCodeSnapshot: string | null
  standardVersionSnapshot: number | null
  standardNameSnapshot: string | null
  samplingModeSnapshot: string | null
  samplingValueSnapshot: number | null
  minSampleQtySnapshot: number | null
  maxSampleQtySnapshot: number | null
  suggestedSampleQty: number
  checkItems: Array<{
    id: string
    name: string
    method: string
    acceptanceCriteria: string
    sortOrder: number
    result: string
    measuredValue: string | null
    note: string | null
  }>
  dispositions: Array<{
    id: string
    dispositionNo: string
    action: string
    sourceStatus: string | null
    targetStatus: string | null
    stockQty: number
    reason: string
    performedBy: string
    performedAt: string
  }>
  lot: {
    id: string
    lotNo: string
    status: string
    material: { id: string; code: string; name: string; stockUnit: string }
    balances: Array<{
      id: string
      inventoryStatus: string
      stockQty: number
      valuationQty: number
      costAmount: number
    }>
  }
}

export interface QualityTaskWorkspace {
  items: QualityTaskItem[]
  counts: { pending: number; disposition: number }
}
