import type {
  PanoramaLayoutConfig,
  PanoramaModuleConfig,
  PanoramaModuleId,
  PanoramaModuleWidth,
  ProcessRouteSummary,
  ProcessStepSummary,
  WorkInstructionSummary,
} from '../contracts/material-panorama'

export const panoramaLayoutStorageKey = 'mes-lite.materialPanorama.layout.v1'

export const defaultPanoramaModules: PanoramaModuleConfig[] = [
  { id: 'summary', visible: true, width: 'full' },
  { id: 'documents', visible: true, width: 'full' },
  { id: 'bomProcess', visible: true, width: 'full' },
  { id: 'costing', visible: true, width: 'full' },
  { id: 'orders', visible: true, width: 'full' },
  { id: 'records', visible: true, width: 'full' },
  { id: 'notes', visible: true, width: 'full' },
]

export const defaultPanoramaLayout: PanoramaLayoutConfig = { version: 1, density: 'comfortable', modules: defaultPanoramaModules }

export const panoramaModuleLabels: Record<PanoramaModuleId, { name: string; description: string }> = {
  summary: { name: '档案与库存', description: '物料档案、库存总览' },
  documents: { name: '库位与文档', description: '库位分布、产品文档、附件' },
  bomProcess: { name: 'BOM 与工艺', description: '相关 BOM、加工工艺和作业步骤' },
  costing: { name: '成本与快照', description: '加工参数、成本对象、物料成本快照' },
  orders: { name: '工单与领料', description: '相关工单、作为用料的领料记录' },
  records: { name: '来料与库存记录', description: '最近来料、库存流水、成本层' },
  notes: { name: '建模说明', description: '当前全景页的数据建模提示' },
}

export const panoramaModuleWidthLabels: Record<PanoramaModuleWidth, string> = { full: '整行', wide: '宽栏', half: '半行' }
export const panoramaModuleWidthClasses: Record<PanoramaModuleWidth, string> = { full: 'xl:col-span-12', wide: 'xl:col-span-8', half: 'xl:col-span-6' }

function normalizeModuleWidth(value: unknown, fallback: PanoramaModuleWidth): PanoramaModuleWidth {
  return value === 'full' || value === 'wide' || value === 'half' ? value : fallback
}

export function normalizePanoramaModules(saved: unknown): PanoramaModuleConfig[] {
  const savedItems = Array.isArray(saved) ? saved : []
  const savedMap = new Map<string, { visible: boolean; width?: unknown }>()
  for (const item of savedItems) {
    if (!item || typeof item !== 'object') continue
    const value = item as { id?: unknown; visible?: unknown; width?: unknown }
    if (typeof value.id === 'string') savedMap.set(value.id, { visible: value.visible !== false, width: value.width })
  }
  const ordered: PanoramaModuleConfig[] = []
  for (const item of savedItems) {
    if (!item || typeof item !== 'object') continue
    const value = item as { id?: unknown; visible?: unknown; width?: unknown }
    const found = defaultPanoramaModules.find((module) => module.id === value.id)
    if (found && !ordered.some((module) => module.id === found.id)) {
      ordered.push({ id: found.id, visible: value.visible !== false, width: normalizeModuleWidth(value.width, found.width) })
    }
  }
  for (const item of defaultPanoramaModules) {
    if (!ordered.some((module) => module.id === item.id)) {
      const savedItem = savedMap.get(item.id)
      ordered.push({ ...item, visible: savedItem?.visible ?? item.visible, width: normalizeModuleWidth(savedItem?.width, item.width) })
    }
  }
  return ordered
}

export function normalizePanoramaLayout(saved: unknown): PanoramaLayoutConfig {
  const value = saved && typeof saved === 'object' && !Array.isArray(saved)
    ? saved as { density?: unknown; modules?: unknown }
    : { modules: saved }
  return { version: 1, density: value.density === 'compact' ? 'compact' : 'comfortable', modules: normalizePanoramaModules(value.modules) }
}

export const materialCategoryLabels: Record<string, string> = {
  RAW: '原材料', FINISHED: '成品', AUXILIARY: '辅材', SCRAP: '废料', DEFECTIVE: '废品', PACKAGING: '包装物', OTHER: '其他',
}
export const processCategoryLabels: Record<string, string> = {
  SAWING: '锯切', DRILLING: '钻孔', TURNING: '车削', MILLING: '铣削', GRINDING: '磨削', HEAT_TREATMENT: '热处理', SURFACE_TREATMENT: '表面处理', ASSEMBLY: '装配', INSPECTION: '检验', OTHER: '其他',
}
const statusLabels: Record<string, string> = {
  ACTIVE: '启用', ARCHIVED: '停用', DRAFT: '草稿', CONFIRMED: '已确认', PICKED: '已领料', IN_PROGRESS: '生产中', QC_DONE: '质检完成', COMPLETED: '已完成', CANCELLED: '已取消', PENDING: '待处理', RECEIVED: '已入库', REJECTED: '已拒收', REVERSED: '已红冲',
}

export function formatNumber(value: number | null | undefined, digits = 3) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: digits })
}
export function formatMoney(value: number | null | undefined) {
  return `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
export function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
export function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN')
}
export function compactDate(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('zh-CN')
}
export function processCostPerThousand(item: Partial<ProcessStepSummary>) {
  const yieldRate = Math.max(0.0001, Number(item.yieldRate || 1))
  const batchQty = Math.max(1, Number(item.standardBatchQty || 1000))
  const runtimeHours = (1000 / yieldRate) * Number(item.cycleTimeSeconds || 0) / 3600
  const setupHours = Number(item.setupTimeMinutes || 0) / 60 * (1000 / batchQty)
  const baseHours = runtimeHours + setupHours
  const laborHours = baseHours * Number(item.peopleCount || 0)
  const machineHours = baseHours * Number(item.machineCount || 0)
  const cost = laborHours * Number(item.laborRatePerHour || 0)
    + machineHours * (Number(item.machineRatePerHour || 0) + Number(item.energyCostPerHour || 0))
    + Number(item.consumableCostPerBatch || 0) * (1000 / batchQty)
  return { laborHours, machineHours, cost }
}
export function statusText(status: string) { return statusLabels[status] || status }
export function documentCategoryText(category: WorkInstructionSummary['category']) { return category.parent ? `${category.parent.name} / ${category.name}` : category.name }

export function collectRelatedRoutes(data: { productBoms: Array<{ product: { processRoutes?: ProcessRouteSummary[] } }>; componentBoms: Array<{ bom: { product: { processRoutes?: ProcessRouteSummary[] } } }>; targetOrders: Array<{ product: { processRoutes?: ProcessRouteSummary[] } }> }) {
  const map = new Map<string, ProcessRouteSummary>()
  for (const bom of data.productBoms) for (const route of bom.product.processRoutes || []) map.set(route.id, route)
  for (const bom of data.componentBoms) for (const route of bom.bom.product.processRoutes || []) map.set(route.id, route)
  for (const order of data.targetOrders) for (const route of order.product.processRoutes || []) map.set(route.id, route)
  return Array.from(map.values())
}
