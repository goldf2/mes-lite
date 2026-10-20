import type {
  PermissionMap,
  ResolvedTaskPermissions,
  TaskCollaborationStatus,
  TaskDeliveryMethod,
  TaskDeliveryStatus,
  TaskDocumentRef,
  TaskDraftInput,
  TaskExecutionProjection,
  TaskExecutionSource,
  TaskOptionItem,
  TaskProgressKind,
  TaskRecipient,
  TaskRecipientKind,
  TaskRecord,
} from '../contracts/task-collaboration'

export {
  normalizeDocumentRef,
  normalizeExecutionProjection,
  normalizeManifestFile,
  normalizeReleaseManifest,
  normalizeReleasePreviewResponse,
  normalizeReleaseSnapshotTask,
  normalizeTaskRecord,
} from './task-collaboration-normalizer'

export const taskStatusLabels: Record<TaskCollaborationStatus, string> = {
  DRAFT: '草稿',
  ASSIGNED: '已派工',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
}

export const taskStatusBadgeClasses: Record<TaskCollaborationStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border border-gray-200',
  ASSIGNED: 'bg-blue-50 text-blue-700 border border-blue-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 border border-blue-300',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border border-gray-200',
}

export const taskExecutionSourceLabels: Record<TaskExecutionSource, string> = {
  MES: 'MES 实绩驱动',
  COLLABORATION: '协同任务自管',
}

const mesExecutionStatusLabels: Record<string, string> = {
  PENDING: '待派工',
  RELEASED: '已发布',
  CONFIRMED: '已发布',
  PICKED: '已发布',
  RUNNING: '进行中',
  QC_WAITING: '进行中',
  QC_DONE: '进行中',
}

export function formatTaskExecutionStatus(execution: TaskExecutionProjection): string {
  const status = execution.status?.trim()
  if (!status) return '不可访问/未提供'
  if (Object.prototype.hasOwnProperty.call(taskStatusLabels, status)) {
    return taskStatusLabels[status as TaskCollaborationStatus]
  }
  if (execution.source === 'MES') {
    if (status === 'DISPATCHED') return execution.dispatch?.status === status ? '已派工' : '已发布'
    if (Object.prototype.hasOwnProperty.call(mesExecutionStatusLabels, status)) {
      return mesExecutionStatusLabels[status]
    }
  }
  return '未知状态'
}

export const taskProgressKindLabels: Record<TaskProgressKind, string> = {
  NOTE: '进度备注',
  EXCEPTION: '异常上报',
}

export const taskRecipientKindLabels: Record<TaskRecipientKind, string> = {
  EMPLOYEE: '内部员工',
  SUPPLIER: '外协供应商',
  INTERNAL: '内部留档',
}

export const taskDeliveryMethodLabels: Record<TaskDeliveryMethod, string> = {
  MANUAL: '当面/纸质签收',
  EXPORT: '清单包导出',
  EMAIL: '邮件发放（人工凭证）',
  WECHAT: '微信发放（人工凭证）',
}

export const taskDeliveryStatusLabels: Record<TaskDeliveryStatus, string> = {
  RECORDED: '已登记',
  EXPORTED: '已导出',
  FAILED: '发放失败',
}

export const taskDeliveryStatusClasses: Record<TaskDeliveryStatus, string> = {
  RECORDED: 'bg-emerald-50 text-emerald-700',
  EXPORTED: 'bg-blue-50 text-blue-700',
  FAILED: 'bg-red-50 text-red-700',
}

type ActionKey = 'read' | 'create' | 'update' | 'delete'

const canonicalFlagByAction: Record<ActionKey, 'canRead' | 'canCreate' | 'canUpdate' | 'canDelete'> = {
  read: 'canRead',
  create: 'canCreate',
  update: 'canUpdate',
  delete: 'canDelete',
}

export function readPermissionFlag(
  permissions: PermissionMap | undefined,
  resource: string,
  action: ActionKey,
): boolean {
  if (!permissions) return false
  const entry = permissions[resource]
  if (typeof entry === 'boolean') return entry
  if (entry && typeof entry === 'object') {
    const canonicalKey = canonicalFlagByAction[action]
    if (typeof entry[canonicalKey] === 'boolean') return Boolean(entry[canonicalKey])
    if (typeof entry[action] === 'boolean') return Boolean(entry[action])
  }
  const flatCanonical = `${resource}.${canonicalFlagByAction[action]}`
  if (typeof permissions[flatCanonical] === 'boolean') {
    return Boolean(permissions[flatCanonical])
  }
  const flatShort = `${resource}.${action}`
  if (typeof permissions[flatShort] === 'boolean') {
    return Boolean(permissions[flatShort])
  }
  return false
}

export function resolveTaskPermissions(permissions?: PermissionMap): ResolvedTaskPermissions {
  const canRead = readPermissionFlag(permissions, 'taskCollaboration', 'read')
  const canCreate = readPermissionFlag(permissions, 'taskCollaboration', 'create')
  const canUpdate = readPermissionFlag(permissions, 'taskCollaboration', 'update')
  const canDelete = readPermissionFlag(permissions, 'taskCollaboration', 'delete')
  const canPublish = readPermissionFlag(permissions, 'taskCollaborationPublish', 'update')

  // 严格按既有附件服务动作映射：缺少 attachments 资源时默认全部拒绝；
  // read -> attachments.canRead
  // upload -> attachments.canCreate（仅 create，不含 update）+ taskCollaboration.canUpdate
  // update（旋转/刷新预览/设置封面等已有附件操作）-> attachments.canRead + taskCollaboration.canUpdate
  // archive -> attachments.canDelete + taskCollaboration.canUpdate
  const attRead = readPermissionFlag(permissions, 'attachments', 'read')
  const attCreate = readPermissionFlag(permissions, 'attachments', 'create')
  const attDelete = readPermissionFlag(permissions, 'attachments', 'delete')

  return {
    canRead,
    canCreate,
    canUpdate,
    canDelete,
    canPublish,
    canReadAttachments: canRead && attRead,
    canUploadAttachments: canUpdate && attCreate,
    canUpdateAttachments: canUpdate && attRead,
    canDeleteAttachments: canUpdate && attDelete,
    canReadMaterials: readPermissionFlag(permissions, 'materials', 'read'),
    canReadEmployees: readPermissionFlag(permissions, 'employees', 'read'),
    canReadSuppliers: readPermissionFlag(permissions, 'suppliers', 'read'),
    canReadOrders: readPermissionFlag(permissions, 'orders', 'read'),
    canReadSalesOrders:
      readPermissionFlag(permissions, 'salesOrder', 'read') ||
      readPermissionFlag(permissions, 'salesOrders', 'read'),
    canReadDispatches:
      readPermissionFlag(permissions, 'dispatch', 'read') ||
      readPermissionFlag(permissions, 'dispatches', 'read'),
    canReadWorkCenters: readPermissionFlag(permissions, 'workCenters', 'read'),
  }
}

export function formatTaskQuantity(value: number | null | undefined, unit?: string): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return '不可访问/未提供'
  }
  const formatted = Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 6 })
  return unit ? `${formatted} ${unit}` : formatted
}

export function formatNullableCounter(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return '不可访问/未提供'
  }
  return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 6 })
}

export function formatTaskDateTime(iso?: string | null): string {
  if (!iso) return '未设置'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatIsoToLocalDateTimeInput(iso?: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function localDateTimeInputToIso(localValue?: string | null): string | null {
  const trimmed = (localValue || '').trim()
  if (!trimmed) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(trimmed)
  if (match) {
    const [, y, m, d, hh, mm] = match
    const localDate = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), 0, 0)
    return Number.isNaN(localDate.getTime()) ? null : localDate.toISOString()
  }
  const fallback = new Date(trimmed)
  return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString()
}

export function isTaskEditableStatus(status: TaskCollaborationStatus, archived?: boolean): boolean {
  if (archived) return false
  return status === 'DRAFT' || status === 'ASSIGNED' || status === 'IN_PROGRESS'
}

export function allowedManualTransitions(
  task: TaskRecord,
): Array<{ value: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'; label: string }> {
  if (task.execution.source === 'MES') return []
  if (task.status === 'ASSIGNED') {
    return [
      { value: 'IN_PROGRESS', label: '转为进行中 (IN_PROGRESS)' },
      { value: 'CANCELLED', label: '取消任务 (CANCELLED)' },
    ]
  }
  if (task.status === 'IN_PROGRESS') {
    return [
      { value: 'COMPLETED', label: '标记已完成 (COMPLETED)' },
      { value: 'CANCELLED', label: '取消任务 (CANCELLED)' },
    ]
  }
  return []
}

export function defaultTaskRecipient(task: TaskRecord): TaskRecipient {
  const empName = task.assigneeEmployee?.name || task.assigneeEmployeeName
  if (task.assigneeEmployeeId) {
    return {
      kind: 'EMPLOYEE',
      id: task.assigneeEmployeeId,
      name: empName || task.assigneeEmployeeId,
    }
  }
  const supName = task.supplier?.name || task.supplierName
  if (task.supplierId) {
    return {
      kind: 'SUPPLIER',
      id: task.supplierId,
      name: supName || task.supplierId,
    }
  }
  const wcName = task.workCenter?.name || task.workCenterName
  return {
    kind: 'INTERNAL',
    name: wcName ? `${wcName}内部归档` : '生产协同内部留档',
  }
}

export function isSameRecipient(left: TaskRecipient, right: TaskRecipient): boolean {
  return (
    left.kind === right.kind &&
    (left.id || '') === (right.id || '') &&
    left.name.trim() === right.name.trim()
  )
}

export function createEmptyTaskDraft(): TaskDraftInput {
  return {
    title: '',
    salesOrderId: null,
    productionOrderId: null,
    assigneeEmployeeId: null,
    supplierId: null,
    workCenterId: null,
    quantity: 100,
    unit: '件',
    dueAt: null,
    instructions: '',
    documentRefs: [],
    lines: [],
  }
}

export function draftFromTaskRecord(task: TaskRecord, asTemplate = false): TaskDraftInput {
  return {
    title: asTemplate ? `${task.title}（副本）` : task.title,
    salesOrderId: asTemplate ? null : (task.salesOrderId || null),
    productionOrderId: asTemplate ? null : (task.productionOrderId || null),
    assigneeEmployeeId: asTemplate ? null : (task.assigneeEmployeeId || null),
    supplierId: asTemplate ? null : (task.supplierId || null),
    workCenterId: task.workCenterId || null,
    quantity: task.quantity,
    unit: task.unit,
    dueAt: asTemplate ? null : (task.dueAt || null),
    instructions: task.instructions || '',
    documentRefs: (task.documentRefs || []).map((ref) => ({
      attachmentId: ref.attachmentId,
      ...(ref.versionLabel ? { versionLabel: ref.versionLabel } : {}),
    })),
    lines: (task.lines || []).map((line) => ({
      ...(asTemplate ? {} : { id: line.id }),
      materialId: line.materialId,
      quantity: line.quantity,
      unit: line.unit,
      note: line.note || '',
      documentRefs: (line.documentRefs || []).map((ref) => ({
        attachmentId: ref.attachmentId,
        ...(ref.versionLabel ? { versionLabel: ref.versionLabel } : {}),
      })),
    })),
    ...(asTemplate ? { templateTaskId: task.id } : {}),
  }
}

export function seedOptionsFromTask(task: TaskRecord | null): {
  materials: TaskOptionItem[]
  employees: TaskOptionItem[]
  suppliers: TaskOptionItem[]
  orders: TaskOptionItem[]
  salesOrders: TaskOptionItem[]
  dispatches: TaskOptionItem[]
  workCenters: TaskOptionItem[]
  files: TaskOptionItem[]
} {
  if (!task) {
    return {
      materials: [],
      employees: [],
      suppliers: [],
      orders: [],
      salesOrders: [],
      dispatches: [],
      workCenters: [],
      files: [],
    }
  }
  const materials: TaskOptionItem[] = task.lines.map((line) => {
    const mat = line.material
    const code = mat?.code || line.materialCode || ''
    const name = mat?.name || line.materialName || line.materialId
    const spec = mat?.spec ?? line.materialSpec ?? null
    return {
      id: line.materialId,
      code,
      name,
      spec,
      unit: mat?.unit || line.unit,
      stockUnit: mat?.stockUnit || line.unit,
      valuationUnit: mat?.valuationUnit || line.unit,
      label: [code, name, spec].filter(Boolean).join(' · ') || line.materialId,
    }
  })

  const employees: TaskOptionItem[] = task.assigneeEmployeeId
    ? [{
        id: task.assigneeEmployeeId,
        code: task.assigneeEmployee?.code || task.assigneeEmployeeCode || undefined,
        name: task.assigneeEmployee?.name || task.assigneeEmployeeName || task.assigneeEmployeeId,
        label: [
          task.assigneeEmployee?.code || task.assigneeEmployeeCode,
          task.assigneeEmployee?.name || task.assigneeEmployeeName || task.assigneeEmployeeId,
        ].filter(Boolean).join(' · '),
      }]
    : []

  const suppliers: TaskOptionItem[] = task.supplierId
    ? [{
        id: task.supplierId,
        code: task.supplier?.code || undefined,
        name: task.supplier?.name || task.supplierName || task.supplierId,
        label: [task.supplier?.code, task.supplier?.name || task.supplierName || task.supplierId]
          .filter(Boolean)
          .join(' · '),
      }]
    : []

  const orders: TaskOptionItem[] = task.productionOrderId
    ? [{
        id: task.productionOrderId,
        orderNo: task.productionOrderNo || task.execution.productionOrder?.orderNo || task.productionOrderId,
        label: task.productionOrderNo || task.execution.productionOrder?.orderNo || task.productionOrderId,
      }]
    : []

  const salesOrders: TaskOptionItem[] = task.salesOrderId
    ? [{
        id: task.salesOrderId,
        orderNo: task.salesOrder?.orderNo || task.salesOrderNo || task.salesOrderId,
        label: task.salesOrder?.orderNo || task.salesOrderNo || task.salesOrderId,
      }]
    : []

  const dispatches: TaskOptionItem[] = task.dispatchId
    ? [{
        id: task.dispatchId,
        dispatchNo: task.dispatchNo || task.execution.dispatch?.dispatchNo || task.dispatchId,
        orderId: task.productionOrderId || undefined,
        label: task.dispatchNo || task.execution.dispatch?.dispatchNo || task.dispatchId,
      }]
    : []

  const workCenters: TaskOptionItem[] = task.workCenterId
    ? [{
        id: task.workCenterId,
        code: task.workCenter?.code || undefined,
        name: task.workCenter?.name || task.workCenterName || task.workCenterId,
        label: [task.workCenter?.code, task.workCenter?.name || task.workCenterName || task.workCenterId]
          .filter(Boolean)
          .join(' · '),
      }]
    : []

  const fileMap = new Map<string, TaskOptionItem>()
  const collectRef = (ref: TaskDocumentRef) => {
    if (!ref.attachmentId || fileMap.has(ref.attachmentId)) return
    fileMap.set(ref.attachmentId, {
      id: ref.attachmentId,
      originalName: ref.originalName || undefined,
      mimeType: ref.mimeType || undefined,
      size: ref.size ?? undefined,
      label: ref.originalName || `附件 ${ref.attachmentId}`,
    })
  }
  task.documentRefs.forEach(collectRef)
  task.lines.forEach((line) => line.documentRefs.forEach(collectRef))
  task.progress.forEach((p) => p.attachmentRefs.forEach(collectRef))

  return {
    materials,
    employees,
    suppliers,
    orders,
    salesOrders,
    dispatches,
    workCenters,
    files: Array.from(fileMap.values()),
  }
}

export function mergeOptionItems(existing: TaskOptionItem[], incoming: TaskOptionItem[]): TaskOptionItem[] {
  const map = new Map<string, TaskOptionItem>()
  incoming.forEach((item) => {
    if (item?.id) map.set(item.id, item)
  })
  existing.forEach((item) => {
    if (item?.id && !map.has(item.id)) map.set(item.id, item)
  })
  return Array.from(map.values())
}
