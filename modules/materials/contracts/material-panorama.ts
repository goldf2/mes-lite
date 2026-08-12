import type { AttachmentPreviewKind } from '@/lib/attachment-file-types'

export interface AttachmentItem {
  id: string
  originalName: string
  mimeType: string
  size: number
  url: string
  thumbnailUrl?: string | null
  previewUrl?: string | null
  previewKind?: AttachmentPreviewKind
  displayUrl?: string | null
  originalUrl?: string | null
  note?: string | null
  documentType: string
  isCover: boolean
  rotation: number
  createdAt: string
}

export interface StockSummary {
  qty: number
  reservedQty: number
  availableQty: number
  quarantineQty: number
  holdQty: number
  valuationQty: number
  reservedValuationQty: number
  availableValuationQty: number
  quarantineValuationQty: number
  holdValuationQty: number
  totalCost: number
  quarantineCost: number
  holdCost: number
  valuationUnitCost: number
  stockUnitCost: number
}

export interface MaterialSummary {
  id: string
  code: string
  name: string
  spec?: string | null
  note?: string | null
  category: string
  unit: string
  stockUnit: string
  valuationUnit: string
  conversionRate: number
  costingMethod: string
  customer?: { id: string; code: string; name: string } | null
  createdAt: string
}

export interface ProcessStepSummary {
  id: string
  stepNo: number
  name: string
  workstation?: string | null
  description?: string | null
  standardBatchQty?: number
  setupTimeMinutes?: number
  cycleTimeSeconds?: number
  peopleCount?: number
  laborRatePerHour?: number
  machineCount?: number
  machineRatePerHour?: number
  energyCostPerHour?: number
  consumableCostPerBatch?: number
  yieldRate?: number
}

export interface ProcessRouteSummary {
  id: string
  name: string
  isDefault: boolean
  steps: ProcessStepSummary[]
}

export interface ProcessTemplateSummary extends Omit<ProcessStepSummary, 'id' | 'stepNo' | 'name'> {
  id: string
  code: string
  name: string
  category: string
  defaultTime?: number | null
  isPreset: boolean
  standardBatchQty: number
  setupTimeMinutes: number
  cycleTimeSeconds: number
  peopleCount: number
  laborRatePerHour: number
  machineCount: number
  machineRatePerHour: number
  energyCostPerHour: number
  consumableCostPerBatch: number
  yieldRate: number
}

export interface ProductSummary {
  id: string
  sku: string
  name: string
  category: string
  unit: string
  customer?: { id: string; code: string; name: string } | null
  processRoutes?: ProcessRouteSummary[]
}

export interface ComponentBomItem {
  id: string
  quantity: number
  unit: string
  wastageRate: number
  bom: { id: string; version: string; isActive: boolean; product: ProductSummary }
}

export interface ProductBom {
  id: string
  version: string
  isActive: boolean
  createdAt: string
  product: ProductSummary
  latestCostRun?: { id: string; unitCost: number; totalCost: number; quantityBasis: number; createdAt: string } | null
  items: Array<{
    id: string
    itemType?: string
    quantity: number
    unit: string
    wastageRate: number
    material?: { id: string; code: string; name: string; spec?: string | null; category: string; stockUnit: string; valuationUnit: string } | null
    costObject?: { id: string; code: string; name: string; objectType: string; unit: string } | null
    sawingScenario?: { id: string; name: string } | null
  }>
}

export interface ProductionOrderSummary {
  id: string
  orderNo: string
  voucherNo?: string | null
  planQty: number
  completeQty: number
  scrapQty: number
  status: string
  note?: string | null
  createdAt: string
  product: ProductSummary
  _count?: { picks: number; reports: number; dispatches: number; stockIns: number }
}

export interface WorkInstructionSummary {
  id: string
  categoryId: string
  category: { id: string; name: string; parentId?: string | null; parent?: { id: string; name: string } | null }
  version: string
  status: string
  note?: string | null
  material: { id: string; code: string; name: string; spec?: string | null; customer?: { id: string; code: string; name: string } | null }
  workCenters: Array<{ id: string; code: string; name: string }>
  attachments: AttachmentItem[]
  attachmentCount: number
  imageCount: number
  pdfCount: number
  createdAt: string
}

export interface PickSummary {
  id: string
  requiredQty: number
  actualQty: number
  actualValuationQty: number
  costAmount: number
  status: string
  pickedAt?: string | null
  createdAt: string
  order: { id: string; orderNo: string; planQty: number; status: string; product: ProductSummary; targetMaterial?: MaterialSummary | null }
}

export interface MaterialInSummary {
  id: string
  inboundNo: string
  voucherNo?: string | null
  qty: number
  unit: string
  valuationQty: number
  valuationUnit: string
  totalAmount: number
  status: string
  batchNo?: string | null
  inboundDate: string
  supplier: { id: string; code: string; name: string }
}

export interface StockLogSummary {
  id: string
  type: string
  qty: number
  beforeQty: number
  afterQty: number
  valuationQty?: number | null
  afterValuationQty?: number | null
  costAmount?: number | null
  afterCostAmount?: number | null
  refType?: string | null
  note?: string | null
  createdAt: string
}

export interface CostLayerSummary {
  id: string
  remainingStockQty: number
  remainingValuationQty: number
  stockUnit: string
  valuationUnit: string
  stockUnitCost: number
  valuationUnitCost: number
  remainingAmount: number
  status: string
  createdAt: string
}

export interface CostObjectSummary {
  id: string
  code: string
  name: string
  objectType: string
  unit: string
  status: string
  costs: Array<{ id: string; materialCostPerUnit: number; laborHoursPerUnit: number; machineHoursPerUnit: number; directCostPerUnit: number; effectiveFrom: string }>
  bomItems: Array<{ id: string; quantity: number; unit: string; bom: { product: { id: string; sku: string; name: string; unit: string } } }>
}

export interface LocationBalance {
  id: string
  locationCode: string
  locationName: string
  qty: number
  reservedQty: number
  availableQty: number
  quarantineQty: number
  holdQty: number
  note?: string
}

export interface PanoramaData {
  material: MaterialSummary
  stock?: StockSummary | null
  locationBalances: LocationBalance[]
  attachments: { images: AttachmentItem[]; documents: AttachmentItem[]; workInstructions: AttachmentItem[] }
  componentBoms: ComponentBomItem[]
  productBoms: ProductBom[]
  costObjects: CostObjectSummary[]
  processTemplates: ProcessTemplateSummary[]
  workInstructions: WorkInstructionSummary[]
  targetOrders: ProductionOrderSummary[]
  consumingPicks: PickSummary[]
  recentMaterialIns: MaterialInSummary[]
  recentStockLogs: StockLogSummary[]
  costLayers: CostLayerSummary[]
  integrityWarnings: string[]
  modelNotes: string[]
}

export type PanoramaModuleId = 'summary' | 'documents' | 'bomProcess' | 'costing' | 'orders' | 'records' | 'notes'
export type PanoramaDisplayDensity = 'comfortable' | 'compact'
export type PanoramaModuleWidth = 'full' | 'wide' | 'half'
export interface PanoramaModuleConfig { id: PanoramaModuleId; visible: boolean; width: PanoramaModuleWidth }
export interface PanoramaLayoutConfig { version: 1; density: PanoramaDisplayDensity; modules: PanoramaModuleConfig[] }

export interface PanoramaViewerState {
  instruction: WorkInstructionSummary
  attachments: AttachmentItem[]
  index: number
}
