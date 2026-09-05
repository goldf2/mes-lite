import { z } from 'zod'

export type ArchiveModel = 'material' | 'supplier' | 'customer' | 'materialIn' | 'workInstruction' | 'order' | 'dispatch' | 'shipment' | 'return'

export const archiveModelSchema = z.enum(['material', 'supplier', 'customer', 'materialIn', 'workInstruction', 'order', 'dispatch', 'shipment', 'return'])

export const purgeArchivedRecordSchema = z.object({
  model: archiveModelSchema,
  id: z.string().min(1),
  confirmation: z.literal('永久删除'),
})

export const dataIntegrityActionSchema = z.object({
  issueId: z.string().min(1),
  action: z.enum([
    'SYNC_BOM_ITEM_UNIT', 'DELETE_BOM_ITEM', 'DELETE_ORPHAN_STOCK',
    'SYNC_BOM_OUTPUT_UNIT', 'SYNC_PRODUCT_UNIT', 'CLEAR_STALE_BOM_ITEM_REF',
  ]),
  confirmation: z.string().optional(),
})

export const executeMaterialCodeNormalizationSchema = z.object({
  confirmation: z.literal('NORMALIZE_MATERIAL_CODES'),
})

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
  modelActions?: Partial<Record<ArchiveModel, { canRestore: boolean; canPurge: boolean }>>
}

export interface ArchivedRecord {
  id: string
  label: string
  type: string
  model: ArchiveModel
  deletedAt?: string | null
  canRestore: boolean
  canPurge: boolean
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
  productChanges: Array<{ id: string; before: string; after: string; materialId: string; materialCode: string }>
  canExecute: boolean
}

export interface MaterialCodeNormalizationResult {
  changedMaterials: number
  changedProducts: number
}
