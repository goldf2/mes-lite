export type ArchiveModel = 'material' | 'supplier' | 'customer' | 'materialIn' | 'workInstruction' | 'order' | 'dispatch' | 'shipment' | 'return'

export interface RawArchivedRecord {
  id: string
  deletedAt?: string | null
  code?: string
  name?: string
  inboundNo?: string
  orderNo?: string
  dispatchNo?: string
  shipmentNo?: string
  returnNo?: string
  material?: { code?: string | null; name?: string | null } | null
}

export interface ArchivedRecordsPayload {
  materials?: RawArchivedRecord[]
  suppliers?: RawArchivedRecord[]
  customers?: RawArchivedRecord[]
  materialIn?: RawArchivedRecord[]
  workInstructions?: RawArchivedRecord[]
  orders?: RawArchivedRecord[]
  dispatches?: RawArchivedRecord[]
  shipments?: RawArchivedRecord[]
  returns?: RawArchivedRecord[]
}

export interface ArchivedRecord {
  id: string
  label: string
  type: string
  model: ArchiveModel
  deletedAt?: string | null
}

export interface AuditLogRecord {
  id: string
  operatorName?: string | null
  action: string
  entityType: string
  entityId?: string | null
  entityLabel?: string | null
  note?: string | null
  createdAt: string
}

export interface MaterialCodeNormalizationPreview {
  totalMaterials: number
  pendingMaterialCount: number
  pendingProductCount: number
  invalidMaterials: Array<{ id: string; code: string; name: string; archived: boolean }>
  materialConflicts: Array<{
    normalizedCode: string
    materials: Array<{ id: string; code: string; name: string; archived: boolean }>
  }>
  productConflicts: Array<{
    normalizedSku: string
    products: Array<{ id: string; sku: string }>
  }>
  ambiguousProducts: Array<{ productId: string; sku: string; materialCodes: string[] }>
  changes: Array<{ id: string; name: string; archived: boolean; before: string; after: string }>
  canExecute: boolean
}

export interface MaterialCodeNormalizationResult {
  changedMaterials: number
  changedProducts: number
}
