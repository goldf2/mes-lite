import type {
  TaskBomLineHydrated,
  TaskCollaborationStatus,
  TaskDeliveryMethod,
  TaskDeliveryStatus,
  TaskDocumentRef,
  TaskEmployeeRef,
  TaskExecutionProjection,
  TaskExecutionSource,
  TaskMaterialRef,
  TaskProgressEntry,
  TaskRecipientKind,
  TaskRecord,
  TaskReleaseManifest,
  TaskReleaseManifestFile,
  TaskReleasePreviewResponse,
  TaskReleaseRecord,
  TaskReleaseSnapshotLine,
  TaskReleaseSnapshotTask,
  TaskSalesOrderRef,
  TaskSupplierRef,
  TaskWorkCenterRef,
} from '../contracts/task-collaboration'

export type AttachmentUrlHydrator = (attachment: {
  id: string
  originalName: string
  mimeType: string
  size: number
  rotation: number
  previewRevision?: number | null
}) => {
  url?: string
  originalUrl?: string
  previewUrl?: string | null
  thumbnailUrl?: string | null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function normalizeDocumentRef(raw: unknown, hydrateUrls?: AttachmentUrlHydrator): TaskDocumentRef {
  const obj = asRecord(raw)
  const attachmentId = String(obj.attachmentId || obj.id || '')
  const versionLabel =
    typeof obj.versionLabel === 'string' && obj.versionLabel.trim() ? obj.versionLabel.trim() : null
  const originalName =
    typeof obj.originalName === 'string' && obj.originalName.trim() ? obj.originalName.trim() : null
  const mimeType =
    typeof obj.mimeType === 'string' && obj.mimeType.trim() ? obj.mimeType.trim() : null
  const size = typeof obj.size === 'number' && Number.isFinite(obj.size) ? obj.size : null
  const rotation = typeof obj.rotation === 'number' && Number.isFinite(obj.rotation) ? obj.rotation : 0
  const previewRevision = typeof obj.previewRevision === 'number' ? obj.previewRevision : null
  const explicitUnavailable = Boolean(obj.fileUnavailable)
  const hasMetadata = Boolean(!explicitUnavailable && originalName && mimeType)

  const computedUrls =
    hasMetadata && hydrateUrls
      ? hydrateUrls({
          id: attachmentId,
          originalName: originalName!,
          mimeType: mimeType!,
          size: size ?? 0,
          rotation,
          previewRevision,
        })
      : undefined

  return {
    attachmentId,
    versionLabel,
    originalName,
    mimeType,
    size,
    rotation,
    previewRevision,
    url: (typeof obj.url === 'string' ? obj.url : computedUrls?.url) ?? null,
    originalUrl: (typeof obj.originalUrl === 'string' ? obj.originalUrl : computedUrls?.originalUrl) ?? null,
    previewUrl: (typeof obj.previewUrl === 'string' ? obj.previewUrl : computedUrls?.previewUrl) ?? null,
    thumbnailUrl: (typeof obj.thumbnailUrl === 'string' ? obj.thumbnailUrl : computedUrls?.thumbnailUrl) ?? null,
    fileUnavailable: !hasMetadata,
    sourceOwnerType: typeof obj.sourceOwnerType === 'string' ? obj.sourceOwnerType : null,
    sourceOwnerId: typeof obj.sourceOwnerId === 'string' ? obj.sourceOwnerId : null,
  }
}

export function normalizeManifestFile(
  raw: unknown,
  hydrateUrls?: AttachmentUrlHydrator,
): TaskReleaseManifestFile {
  const obj = asRecord(raw)
  const attachmentId = String(obj.attachmentId || '')
  const originalName = String(obj.originalName || attachmentId)
  const mimeType = String(obj.mimeType || 'application/octet-stream')
  const size = typeof obj.size === 'number' && Number.isFinite(obj.size) ? obj.size : 0
  const rotation = typeof obj.rotation === 'number' && Number.isFinite(obj.rotation) ? obj.rotation : 0
  const urls =
    attachmentId && hydrateUrls
      ? hydrateUrls({ id: attachmentId, originalName, mimeType, size, rotation })
      : undefined

  return {
    attachmentId,
    sourceAttachmentId: String(obj.sourceAttachmentId || ''),
    sourceOwnerType: String(obj.sourceOwnerType || 'TASK_COLLABORATION'),
    sourceOwnerId: String(obj.sourceOwnerId || ''),
    sourceDocumentVersion: (obj.sourceDocumentVersion as string | number | null) ?? null,
    sourceDocumentUpdatedAt: typeof obj.sourceDocumentUpdatedAt === 'string' ? obj.sourceDocumentUpdatedAt : null,
    originalName,
    mimeType,
    size,
    rotation,
    sha256: String(obj.sha256 || ''),
    versionLabel: typeof obj.versionLabel === 'string' && obj.versionLabel.trim() ? obj.versionLabel.trim() : null,
    bomLineId: typeof obj.bomLineId === 'string' ? obj.bomLineId : null,
    url: typeof obj.url === 'string' ? obj.url : urls?.url,
    originalUrl: typeof obj.originalUrl === 'string' ? obj.originalUrl : urls?.originalUrl,
    previewUrl: typeof obj.previewUrl === 'string' ? obj.previewUrl : (urls?.previewUrl ?? null),
    thumbnailUrl: typeof obj.thumbnailUrl === 'string' ? obj.thumbnailUrl : (urls?.thumbnailUrl ?? null),
  }
}

function normalizeMaterialRef(raw: unknown): TaskMaterialRef | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = asRecord(raw)
  if (!obj.id) return null
  return {
    id: String(obj.id),
    code: String(obj.code || ''),
    name: String(obj.name || ''),
    spec: typeof obj.spec === 'string' ? obj.spec : null,
    unit: String(obj.unit || obj.stockUnit || '件'),
    stockUnit: typeof obj.stockUnit === 'string' ? obj.stockUnit : null,
    valuationUnit: typeof obj.valuationUnit === 'string' ? obj.valuationUnit : null,
  }
}

function normalizeEmployeeRef(raw: unknown): TaskEmployeeRef | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = asRecord(raw)
  if (!obj.id) return null
  return {
    id: String(obj.id),
    code: typeof obj.code === 'string' ? obj.code : null,
    name: String(obj.name || ''),
    department: typeof obj.department === 'string' ? obj.department : null,
  }
}

function normalizeSupplierRef(raw: unknown): TaskSupplierRef | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = asRecord(raw)
  if (!obj.id) return null
  return {
    id: String(obj.id),
    code: typeof obj.code === 'string' ? obj.code : null,
    name: String(obj.name || ''),
  }
}

function normalizeWorkCenterRef(raw: unknown): TaskWorkCenterRef | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = asRecord(raw)
  if (!obj.id) return null
  return {
    id: String(obj.id),
    code: typeof obj.code === 'string' ? obj.code : null,
    name: String(obj.name || ''),
  }
}

function normalizeSalesOrderRef(raw: unknown): TaskSalesOrderRef | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = asRecord(raw)
  if (!obj.id) return null
  const customer = asRecord(obj.customer)
  return {
    id: String(obj.id),
    orderNo: String(obj.orderNo || ''),
    status: typeof obj.status === 'string' ? obj.status : null,
    customerName:
      typeof obj.customerName === 'string'
        ? obj.customerName
        : typeof customer.name === 'string'
          ? customer.name
          : null,
  }
}

export function normalizeExecutionProjection(raw: unknown): TaskExecutionProjection {
  const obj = asRecord(raw)
  const source: TaskExecutionSource = obj.source === 'MES' ? 'MES' : 'COLLABORATION'
  const poRaw = obj.productionOrder && typeof obj.productionOrder === 'object' ? asRecord(obj.productionOrder) : null
  const dpRaw = obj.dispatch && typeof obj.dispatch === 'object' ? asRecord(obj.dispatch) : null

  return {
    source,
    productionOrder:
      poRaw && poRaw.id
        ? {
            id: String(poRaw.id),
            orderNo: String(poRaw.orderNo || ''),
            status: typeof poRaw.status === 'string' ? poRaw.status : null,
            planQty: typeof poRaw.planQty === 'number' && Number.isFinite(poRaw.planQty) ? poRaw.planQty : null,
            completeQty:
              typeof poRaw.completeQty === 'number' && Number.isFinite(poRaw.completeQty) ? poRaw.completeQty : null,
            scrapQty: typeof poRaw.scrapQty === 'number' && Number.isFinite(poRaw.scrapQty) ? poRaw.scrapQty : null,
          }
        : null,
    dispatch:
      dpRaw && dpRaw.id
        ? {
            id: String(dpRaw.id),
            dispatchNo: String(dpRaw.dispatchNo || ''),
            status: typeof dpRaw.status === 'string' ? dpRaw.status : null,
            planQty: typeof dpRaw.planQty === 'number' && Number.isFinite(dpRaw.planQty) ? dpRaw.planQty : null,
            employeeId: typeof dpRaw.employeeId === 'string' ? dpRaw.employeeId : null,
            workerName: typeof dpRaw.workerName === 'string' ? dpRaw.workerName : null,
          }
        : null,
    status: typeof obj.status === 'string' && obj.status.trim() ? obj.status : null,
  }
}

export function normalizeReleaseSnapshotTask(raw: unknown): TaskReleaseSnapshotTask {
  const obj = asRecord(raw)
  const assigneeEmployee = normalizeEmployeeRef(obj.assigneeEmployee)
  const supplier = normalizeSupplierRef(obj.supplier)
  const workCenter = normalizeWorkCenterRef(obj.workCenter)
  const salesOrder = normalizeSalesOrderRef(obj.salesOrder)
  const rawLines = Array.isArray(obj.lines) ? obj.lines : []

  const lines: TaskReleaseSnapshotLine[] = rawLines.map((lineRaw, index) => {
    const l = asRecord(lineRaw)
    const material = normalizeMaterialRef(l.material)
    return {
      id: String(l.id || `line-${index + 1}`),
      materialId: String(l.materialId || material?.id || ''),
      material,
      materialCode: material?.code || (typeof l.materialCode === 'string' ? l.materialCode : undefined),
      materialName: material?.name || (typeof l.materialName === 'string' ? l.materialName : undefined),
      materialSpec: material?.spec ?? (typeof l.materialSpec === 'string' ? l.materialSpec : null),
      quantity: Number(l.quantity || 0),
      unit: String(l.unit || material?.unit || '件'),
      note: typeof l.note === 'string' ? l.note : null,
    }
  })

  return {
    id: String(obj.id || ''),
    taskNo: String(obj.taskNo || ''),
    title: String(obj.title || ''),
    revision: Number(obj.revision || 1),
    quantity: Number(obj.quantity || 0),
    unit: String(obj.unit || '件'),
    dueAt: typeof obj.dueAt === 'string' ? obj.dueAt : null,
    instructions: typeof obj.instructions === 'string' ? obj.instructions : null,
    salesOrderId: typeof obj.salesOrderId === 'string' ? obj.salesOrderId : (salesOrder?.id ?? null),
    salesOrder,
    productionOrderId: typeof obj.productionOrderId === 'string' ? obj.productionOrderId : null,
    assigneeEmployeeId:
      typeof obj.assigneeEmployeeId === 'string' ? obj.assigneeEmployeeId : (assigneeEmployee?.id ?? null),
    assigneeEmployee,
    supplierId: typeof obj.supplierId === 'string' ? obj.supplierId : (supplier?.id ?? null),
    supplier,
    workCenterId: typeof obj.workCenterId === 'string' ? obj.workCenterId : (workCenter?.id ?? null),
    workCenter,
    lines,
  }
}

export function normalizeReleaseManifest(raw: unknown, hydrateUrls?: AttachmentUrlHydrator): TaskReleaseManifest {
  const obj = asRecord(raw)
  const recipientRaw = asRecord(obj.recipient)
  const execRaw = asRecord(obj.execution)
  const filesRaw = Array.isArray(obj.files) ? obj.files : []

  return {
    task: normalizeReleaseSnapshotTask(obj.task),
    recipient: {
      kind: (recipientRaw.kind as TaskRecipientKind) || 'INTERNAL',
      ...(typeof recipientRaw.id === 'string' && recipientRaw.id ? { id: recipientRaw.id } : {}),
      name: String(recipientRaw.name || ''),
    },
    files: filesRaw.map((f) => normalizeManifestFile(f, hydrateUrls)),
    execution: {
      source: execRaw.source === 'MES' ? 'MES' : 'COLLABORATION',
      productionOrderId: typeof execRaw.productionOrderId === 'string' ? execRaw.productionOrderId : null,
      dispatchId: typeof execRaw.dispatchId === 'string' ? execRaw.dispatchId : null,
    },
    ...(typeof obj.previewToken === 'string' ? { previewToken: obj.previewToken } : {}),
  }
}

export function normalizeReleasePreviewResponse(
  raw: unknown,
  hydrateUrls?: AttachmentUrlHydrator,
): TaskReleasePreviewResponse {
  const obj = asRecord(raw)
  const recipientRaw = asRecord(obj.recipient)
  const execProjection = normalizeExecutionProjection(obj.execution)
  const execRaw = asRecord(obj.execution)
  const filesRaw = Array.isArray(obj.files) ? obj.files : []

  return {
    revision: Number(obj.revision || 1),
    task: normalizeReleaseSnapshotTask(obj.task),
    recipient: {
      kind: (recipientRaw.kind as TaskRecipientKind) || 'INTERNAL',
      ...(typeof recipientRaw.id === 'string' && recipientRaw.id ? { id: recipientRaw.id } : {}),
      name: String(recipientRaw.name || ''),
    },
    files: filesRaw.map((f) => normalizeManifestFile(f, hydrateUrls)),
    execution: {
      ...execProjection,
      productionOrderId:
        typeof execRaw.productionOrderId === 'string'
          ? execRaw.productionOrderId
          : (execProjection.productionOrder?.id ?? null),
      dispatchId:
        typeof execRaw.dispatchId === 'string'
          ? execRaw.dispatchId
          : (execProjection.dispatch?.id ?? null),
    },
    previewToken: String(obj.previewToken || ''),
  }
}

export function normalizeTaskRecord(raw: unknown, hydrateUrls?: AttachmentUrlHydrator): TaskRecord {
  const obj = asRecord(raw)
  const assigneeEmployee = normalizeEmployeeRef(obj.assigneeEmployee)
  const supplier = normalizeSupplierRef(obj.supplier)
  const workCenter = normalizeWorkCenterRef(obj.workCenter)
  const salesOrder = normalizeSalesOrderRef(obj.salesOrder)
  const execution = normalizeExecutionProjection(obj.execution)
  const poNested = obj.productionOrder && typeof obj.productionOrder === 'object' ? asRecord(obj.productionOrder) : null
  const dpNested = obj.dispatch && typeof obj.dispatch === 'object' ? asRecord(obj.dispatch) : null

  const rawDocRefs = Array.isArray(obj.documentRefs) ? obj.documentRefs : []
  const rawLines = Array.isArray(obj.lines) ? obj.lines : []
  const rawProgress = Array.isArray(obj.progress) ? obj.progress : []
  const rawReleases = Array.isArray(obj.releases) ? obj.releases : []

  const lines: TaskBomLineHydrated[] = rawLines.map((lineRaw, index) => {
    const l = asRecord(lineRaw)
    const material = normalizeMaterialRef(l.material)
    const lineDocRefs = Array.isArray(l.documentRefs) ? l.documentRefs : []
    return {
      id: String(l.id || `line-${index + 1}`),
      materialId: String(l.materialId || material?.id || ''),
      material,
      materialCode: material?.code || (typeof l.materialCode === 'string' ? l.materialCode : undefined),
      materialName: material?.name || (typeof l.materialName === 'string' ? l.materialName : undefined),
      materialSpec: material?.spec ?? (typeof l.materialSpec === 'string' ? l.materialSpec : null),
      quantity: Number(l.quantity || 0),
      unit: String(l.unit || material?.unit || material?.stockUnit || '件'),
      note: typeof l.note === 'string' ? l.note : null,
      documentRefs: lineDocRefs.map((ref) => normalizeDocumentRef(ref, hydrateUrls)),
    }
  })

  const progress: TaskProgressEntry[] = rawProgress.map((progRaw, index) => {
    const p = asRecord(progRaw)
    const actor = p.actor && typeof p.actor === 'object' ? asRecord(p.actor) : null
    const refs = Array.isArray(p.attachmentRefs) ? p.attachmentRefs : []
    return {
      id: String(p.id || `prog-${index + 1}`),
      kind: p.kind === 'EXCEPTION' ? 'EXCEPTION' : 'NOTE',
      note: String(p.note || ''),
      attachmentRefs: refs.map((ref) => normalizeDocumentRef(ref, hydrateUrls)),
      actorId: String(p.actorId || actor?.id || ''),
      actorName: String(p.actorName || actor?.name || p.actorId || ''),
      createdAt: String(p.createdAt || ''),
    }
  })

  const releases: TaskReleaseRecord[] = rawReleases.map((relRaw, index) => {
    const r = asRecord(relRaw)
    const deliveriesRaw = Array.isArray(r.deliveries) ? r.deliveries : []
    return {
      id: String(r.id || `rel-${index + 1}`),
      taskId: String(r.taskId || obj.id || ''),
      revision: Number(r.revision || 1),
      operationId: String(r.operationId || ''),
      manifest: normalizeReleaseManifest(r.manifest, hydrateUrls),
      createdBy: String(r.createdBy || ''),
      createdByName: typeof r.createdByName === 'string' ? r.createdByName : undefined,
      createdAt: String(r.createdAt || ''),
      deliveries: deliveriesRaw.map((delRaw, dIdx) => {
        const d = asRecord(delRaw)
        return {
          id: String(d.id || `del-${dIdx + 1}`),
          releaseId: String(d.releaseId || r.id || ''),
          method: (d.method as TaskDeliveryMethod) || 'MANUAL',
          recipientName: String(d.recipientName || ''),
          status: (d.status as TaskDeliveryStatus) || 'RECORDED',
          note: typeof d.note === 'string' ? d.note : null,
          actorId: String(d.actorId || ''),
          actorName: typeof d.actorName === 'string' ? d.actorName : undefined,
          createdAt: String(d.createdAt || ''),
        }
      }),
    }
  })

  return {
    id: String(obj.id || ''),
    taskNo: String(obj.taskNo || ''),
    status: (obj.status as TaskCollaborationStatus) || 'DRAFT',
    revision: Number(obj.revision || 1),
    title: String(obj.title || ''),
    salesOrderId: typeof obj.salesOrderId === 'string' ? obj.salesOrderId : (salesOrder?.id ?? null),
    salesOrder,
    salesOrderNo: salesOrder?.orderNo || (typeof obj.salesOrderNo === 'string' ? obj.salesOrderNo : null),
    customerName: salesOrder?.customerName || (typeof obj.customerName === 'string' ? obj.customerName : null),
    productionOrderId:
      typeof obj.productionOrderId === 'string' ? obj.productionOrderId : (execution.productionOrder?.id ?? null),
    productionOrderNo:
      execution.productionOrder?.orderNo ||
      (poNested && typeof poNested.orderNo === 'string' ? poNested.orderNo : null) ||
      (typeof obj.productionOrderNo === 'string' ? obj.productionOrderNo : null),
    assigneeEmployeeId:
      typeof obj.assigneeEmployeeId === 'string' ? obj.assigneeEmployeeId : (assigneeEmployee?.id ?? null),
    assigneeEmployee,
    assigneeEmployeeName:
      assigneeEmployee?.name || (typeof obj.assigneeEmployeeName === 'string' ? obj.assigneeEmployeeName : null),
    assigneeEmployeeCode:
      assigneeEmployee?.code || (typeof obj.assigneeEmployeeCode === 'string' ? obj.assigneeEmployeeCode : null),
    supplierId: typeof obj.supplierId === 'string' ? obj.supplierId : (supplier?.id ?? null),
    supplier,
    supplierName: supplier?.name || (typeof obj.supplierName === 'string' ? obj.supplierName : null),
    workCenterId: typeof obj.workCenterId === 'string' ? obj.workCenterId : (workCenter?.id ?? null),
    workCenter,
    workCenterName: workCenter?.name || (typeof obj.workCenterName === 'string' ? obj.workCenterName : null),
    quantity: Number(obj.quantity || 0),
    unit: String(obj.unit || '件'),
    dueAt: typeof obj.dueAt === 'string' ? obj.dueAt : null,
    instructions: typeof obj.instructions === 'string' ? obj.instructions : null,
    documentRefs: rawDocRefs.map((ref) => normalizeDocumentRef(ref, hydrateUrls)),
    lines,
    dispatchId: typeof obj.dispatchId === 'string' ? obj.dispatchId : (execution.dispatch?.id ?? null),
    dispatchNo:
      execution.dispatch?.dispatchNo ||
      (dpNested && typeof dpNested.dispatchNo === 'string' ? dpNested.dispatchNo : null) ||
      (typeof obj.dispatchNo === 'string' ? obj.dispatchNo : null),
    execution,
    progress,
    releases,
    deletedAt: typeof obj.deletedAt === 'string' ? obj.deletedAt : null,
    deletedBy: typeof obj.deletedBy === 'string' ? obj.deletedBy : null,
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : undefined,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : undefined,
  }
}
