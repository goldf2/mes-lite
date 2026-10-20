export type TaskCollaborationStatus =
  | 'DRAFT'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'

export type TaskExecutionSource = 'MES' | 'COLLABORATION'

export type TaskProgressKind = 'NOTE' | 'EXCEPTION'

export type TaskRecipientKind = 'EMPLOYEE' | 'SUPPLIER' | 'INTERNAL'

export type TaskDeliveryMethod = 'MANUAL' | 'EXPORT' | 'EMAIL' | 'WECHAT'

export type TaskDeliveryStatus = 'RECORDED' | 'EXPORTED' | 'FAILED'

export type TaskOptionType =
  | 'materials'
  | 'employees'
  | 'suppliers'
  | 'orders'
  | 'salesOrders'
  | 'dispatches'
  | 'workCenters'
  | 'files'

export type TaskErrorCode =
  | 'UNAUTHENTICATED'
  | 'PERMISSION_DENIED'
  | 'SCOPE_DENIED'
  | 'NOT_FOUND'
  | 'FILE_UNAVAILABLE'
  | 'VALIDATION_ERROR'
  | 'INVALID_REFERENCE'
  | 'INVALID_TRANSITION'
  | 'VERSION_CONFLICT'
  | 'ALREADY_RELEASED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INTERNAL_ERROR'
  | string

export interface TaskDocumentRefInput {
  attachmentId: string
  versionLabel?: string | null
}

export interface TaskDocumentRef extends TaskDocumentRefInput {
  originalName?: string | null
  mimeType?: string | null
  size?: number | null
  rotation?: number | null
  previewRevision?: number | null
  url?: string | null
  originalUrl?: string | null
  previewUrl?: string | null
  thumbnailUrl?: string | null
  fileUnavailable?: boolean
  sourceOwnerType?: string | null
  sourceOwnerId?: string | null
}

export interface TaskEmployeeRef {
  id: string
  code?: string | null
  name: string
  department?: string | null
}

export interface TaskSupplierRef {
  id: string
  code?: string | null
  name: string
}

export interface TaskWorkCenterRef {
  id: string
  code?: string | null
  name: string
}

export interface TaskSalesOrderRef {
  id: string
  orderNo: string
  status?: string | null
  customerName?: string | null
}

export interface TaskMaterialRef {
  id: string
  code: string
  name: string
  spec?: string | null
  unit: string
  stockUnit?: string | null
  valuationUnit?: string | null
}

export interface TaskBomLineInput {
  id?: string
  materialId: string
  quantity: number
  unit: string
  note?: string | null
  documentRefs?: TaskDocumentRefInput[]
}

export interface TaskBomLineHydrated extends Omit<TaskBomLineInput, 'id' | 'documentRefs'> {
  id: string
  material?: TaskMaterialRef | null
  materialCode?: string
  materialName?: string
  materialSpec?: string | null
  documentRefs: TaskDocumentRef[]
}

export interface TaskDraftInput {
  title: string
  salesOrderId?: string | null
  productionOrderId?: string | null
  assigneeEmployeeId?: string | null
  supplierId?: string | null
  workCenterId?: string | null
  quantity: number
  unit: string
  dueAt?: string | null
  instructions?: string | null
  documentRefs: TaskDocumentRefInput[]
  lines: TaskBomLineInput[]
  templateTaskId?: string
}

export interface TaskPatchInput extends Omit<TaskDraftInput, 'templateTaskId'> {
  expectedRevision: number
}

export interface TaskExecutionProductionOrder {
  id: string
  orderNo: string
  status: string | null
  planQty: number | null
  completeQty: number | null
  scrapQty: number | null
}

export interface TaskExecutionDispatch {
  id: string
  dispatchNo: string
  status: string | null
  planQty: number | null
  employeeId?: string | null
  workerName?: string | null
}

export interface TaskExecutionProjection {
  source: TaskExecutionSource
  productionOrder: TaskExecutionProductionOrder | null
  dispatch: TaskExecutionDispatch | null
  status: string | null
}

export interface TaskReleaseManifestExecution {
  source: TaskExecutionSource
  productionOrderId?: string | null
  dispatchId?: string | null
}

export interface TaskProgressEntry {
  id: string
  kind: TaskProgressKind
  note: string
  attachmentRefs: TaskDocumentRef[]
  actorId: string
  actorName: string
  createdAt: string
}

export interface TaskRecipient {
  kind: TaskRecipientKind
  id?: string
  name: string
}

export interface TaskReleaseManifestFile {
  attachmentId: string
  sourceAttachmentId: string
  sourceOwnerType: string
  sourceOwnerId: string
  sourceDocumentVersion?: string | number | null
  sourceDocumentUpdatedAt?: string | null
  originalName: string
  mimeType: string
  size: number
  rotation?: number
  sha256: string
  versionLabel?: string | null
  bomLineId?: string | null
  url?: string
  originalUrl?: string
  previewUrl?: string | null
  thumbnailUrl?: string | null
}

export interface TaskReleaseSnapshotLine {
  id: string
  materialId: string
  material?: TaskMaterialRef | null
  materialCode?: string
  materialName?: string
  materialSpec?: string | null
  quantity: number
  unit: string
  note?: string | null
}

export interface TaskReleaseSnapshotTask {
  id: string
  taskNo: string
  title: string
  revision: number
  quantity: number
  unit: string
  dueAt?: string | null
  instructions?: string | null
  salesOrderId?: string | null
  salesOrder?: TaskSalesOrderRef | null
  productionOrderId?: string | null
  assigneeEmployeeId?: string | null
  assigneeEmployee?: TaskEmployeeRef | null
  supplierId?: string | null
  supplier?: TaskSupplierRef | null
  workCenterId?: string | null
  workCenter?: TaskWorkCenterRef | null
  lines: TaskReleaseSnapshotLine[]
}

export interface TaskReleaseManifest {
  task: TaskReleaseSnapshotTask
  recipient: TaskRecipient
  files: TaskReleaseManifestFile[]
  execution: TaskReleaseManifestExecution
  previewToken?: string
}

export interface TaskReleasePreviewResponse {
  revision: number
  task: TaskReleaseSnapshotTask
  recipient: TaskRecipient
  files: TaskReleaseManifestFile[]
  execution: TaskExecutionProjection & {
    productionOrderId?: string | null
    dispatchId?: string | null
  }
  previewToken: string
}

export interface TaskDeliveryRecord {
  id: string
  releaseId: string
  method: TaskDeliveryMethod
  recipientName: string
  status: TaskDeliveryStatus
  note?: string | null
  actorId: string
  actorName?: string
  createdAt: string
}

export interface TaskReleaseRecord {
  id: string
  taskId: string
  revision: number
  operationId: string
  manifest: TaskReleaseManifest
  createdBy: string
  createdByName?: string
  createdAt: string
  deliveries: TaskDeliveryRecord[]
}

export interface TaskRecord {
  id: string
  taskNo: string
  status: TaskCollaborationStatus
  revision: number
  title: string
  salesOrderId?: string | null
  salesOrder?: TaskSalesOrderRef | null
  salesOrderNo?: string | null
  customerName?: string | null
  productionOrderId?: string | null
  productionOrderNo?: string | null
  assigneeEmployeeId?: string | null
  assigneeEmployee?: TaskEmployeeRef | null
  assigneeEmployeeName?: string | null
  assigneeEmployeeCode?: string | null
  supplierId?: string | null
  supplier?: TaskSupplierRef | null
  supplierName?: string | null
  workCenterId?: string | null
  workCenter?: TaskWorkCenterRef | null
  workCenterName?: string | null
  quantity: number
  unit: string
  dueAt?: string | null
  instructions?: string | null
  documentRefs: TaskDocumentRef[]
  lines: TaskBomLineHydrated[]
  dispatchId?: string | null
  dispatchNo?: string | null
  execution: TaskExecutionProjection
  progress: TaskProgressEntry[]
  releases: TaskReleaseRecord[]
  deletedAt?: string | null
  deletedBy?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface TaskPagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface TaskListResponse {
  data: TaskRecord[]
  pagination: TaskPagination
}

export interface TaskOptionItem {
  id: string
  label: string
  code?: string
  name?: string
  spec?: string | null
  department?: string | null
  unit?: string
  stockUnit?: string
  valuationUnit?: string
  orderId?: string
  orderNo?: string
  dispatchNo?: string
  employeeId?: string
  workCenterId?: string
  mimeType?: string
  size?: number
  originalName?: string
  previewUrl?: string | null
  originalUrl?: string | null
  thumbnailUrl?: string | null
  rotation?: number
  [key: string]: unknown
}

export interface ResourcePermissionFlags {
  canRead?: boolean
  canCreate?: boolean
  canUpdate?: boolean
  canDelete?: boolean
  canGrant?: boolean
  read?: boolean
  create?: boolean
  update?: boolean
  delete?: boolean
  [action: string]: boolean | undefined
}

export type PermissionMap = Record<string, boolean | ResourcePermissionFlags | undefined>

export interface ResolvedTaskPermissions {
  canRead: boolean
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  canPublish: boolean
  canReadAttachments: boolean
  canUploadAttachments: boolean
  canUpdateAttachments: boolean
  canDeleteAttachments: boolean
  canReadMaterials: boolean
  canReadEmployees: boolean
  canReadSuppliers: boolean
  canReadOrders: boolean
  canReadSalesOrders: boolean
  canReadDispatches: boolean
  canReadWorkCenters: boolean
}
