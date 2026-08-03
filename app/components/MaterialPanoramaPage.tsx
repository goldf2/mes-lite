'use client'

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react'
import ModalOverlay from './ModalOverlay'
import DocumentPreviewThumb from './DocumentPreviewThumb'
import PdfDocumentViewer from './PdfDocumentViewer'
import { normalizeAttachmentRotation } from '@/lib/attachment-rotation'

interface AttachmentItem {
  id: string
  originalName: string
  mimeType: string
  size: number
  url: string
  thumbnailUrl?: string | null
  note?: string | null
  documentType: string
  isCover: boolean
  rotation: number
  createdAt: string
}

interface StockSummary {
  qty: number
  reservedQty: number
  availableQty: number
  valuationQty: number
  reservedValuationQty: number
  availableValuationQty: number
  totalCost: number
  valuationUnitCost: number
  stockUnitCost: number
}

interface MaterialSummary {
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

interface ProcessStepSummary {
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

interface ProcessRouteSummary {
  id: string
  name: string
  isDefault: boolean
  steps: ProcessStepSummary[]
}

interface ProcessTemplateSummary {
  id: string
  code: string
  name: string
  category: string
  defaultTime?: number | null
  workstation?: string | null
  description?: string | null
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

interface ProductSummary {
  id: string
  sku: string
  name: string
  category: string
  unit: string
  customer?: { id: string; code: string; name: string } | null
  processRoutes?: ProcessRouteSummary[]
}

interface ComponentBomItem {
  id: string
  quantity: number
  unit: string
  wastageRate: number
  bom: {
    id: string
    version: string
    isActive: boolean
    product: ProductSummary
  }
}

interface ProductBom {
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
    material?: {
      id: string
      code: string
      name: string
      spec?: string | null
      category: string
      stockUnit: string
      valuationUnit: string
    } | null
    costObject?: { id: string; code: string; name: string; objectType: string; unit: string } | null
    sawingScenario?: { id: string; name: string } | null
  }>
}

interface ProductionOrderSummary {
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
  _count?: {
    picks: number
    reports: number
    dispatches: number
    stockIns: number
  }
}

interface WorkInstructionSummary {
  id: string
  categoryId: string
  category: {
    id: string
    name: string
    parentId?: string | null
    parent?: { id: string; name: string } | null
  }
  version: string
  status: string
  note?: string | null
  material: {
    id: string
    code: string
    name: string
    spec?: string | null
    customer?: { id: string; code: string; name: string } | null
  }
  workCenters: Array<{ id: string; code: string; name: string }>
  attachments: AttachmentItem[]
  attachmentCount: number
  imageCount: number
  pdfCount: number
  createdAt: string
}

interface PickSummary {
  id: string
  requiredQty: number
  actualQty: number
  actualValuationQty: number
  costAmount: number
  status: string
  pickedAt?: string | null
  createdAt: string
  order: {
    id: string
    orderNo: string
    planQty: number
    status: string
    product: ProductSummary
    targetMaterial?: MaterialSummary | null
  }
}

interface MaterialInSummary {
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

interface StockLogSummary {
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

interface CostLayerSummary {
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

type PanoramaModuleId = 'summary' | 'documents' | 'bomProcess' | 'costing' | 'orders' | 'records' | 'notes'
type PanoramaDisplayDensity = 'comfortable' | 'compact'
type PanoramaModuleWidth = 'full' | 'wide' | 'half'

interface PanoramaModuleConfig {
  id: PanoramaModuleId
  visible: boolean
  width: PanoramaModuleWidth
}

interface PanoramaLayoutConfig {
  version: 1
  density: PanoramaDisplayDensity
  modules: PanoramaModuleConfig[]
}

const panoramaLayoutStorageKey = 'mes-lite.materialPanorama.layout.v1'

const defaultPanoramaModules: PanoramaModuleConfig[] = [
  { id: 'summary', visible: true, width: 'full' },
  { id: 'documents', visible: true, width: 'full' },
  { id: 'bomProcess', visible: true, width: 'full' },
  { id: 'costing', visible: true, width: 'full' },
  { id: 'orders', visible: true, width: 'full' },
  { id: 'records', visible: true, width: 'full' },
  { id: 'notes', visible: true, width: 'full' },
]

const defaultPanoramaLayout: PanoramaLayoutConfig = {
  version: 1,
  density: 'comfortable',
  modules: defaultPanoramaModules,
}

const panoramaModuleLabels: Record<PanoramaModuleId, { name: string; description: string }> = {
  summary: { name: '档案与库存', description: '物料档案、库存总览' },
  documents: { name: '库位与文档', description: '库位分布、产品文档、附件' },
  bomProcess: { name: 'BOM 与工艺', description: '相关 BOM、加工工艺和作业步骤' },
  costing: { name: '成本与快照', description: '加工参数、成本对象、物料成本快照' },
  orders: { name: '工单与领料', description: '相关工单、作为用料的领料记录' },
  records: { name: '来料与库存记录', description: '最近来料、库存流水、成本层' },
  notes: { name: '建模说明', description: '当前全景页的数据建模提示' },
}

const panoramaModuleWidthLabels: Record<PanoramaModuleWidth, string> = {
  full: '整行',
  wide: '宽栏',
  half: '半行',
}

const panoramaModuleWidthClasses: Record<PanoramaModuleWidth, string> = {
  full: 'xl:col-span-12',
  wide: 'xl:col-span-8',
  half: 'xl:col-span-6',
}

const PanoramaDensityContext = createContext<PanoramaDisplayDensity>('comfortable')
const PanoramaDensityProvider = PanoramaDensityContext.Provider

function normalizeModuleWidth(value: unknown, fallback: PanoramaModuleWidth): PanoramaModuleWidth {
  return value === 'full' || value === 'wide' || value === 'half' ? value : fallback
}

function normalizePanoramaModules(saved: unknown): PanoramaModuleConfig[] {
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
      ordered.push({
        id: found.id,
        visible: value.visible !== false,
        width: normalizeModuleWidth(value.width, found.width),
      })
    }
  }

  for (const item of defaultPanoramaModules) {
    if (!ordered.some((module) => module.id === item.id)) {
      const savedItem = savedMap.get(item.id)
      ordered.push({
        ...item,
        visible: savedItem?.visible ?? item.visible,
        width: normalizeModuleWidth(savedItem?.width, item.width),
      })
    }
  }

  return ordered
}

function normalizePanoramaLayout(saved: unknown): PanoramaLayoutConfig {
  const value = saved && typeof saved === 'object' && !Array.isArray(saved)
    ? saved as { density?: unknown; modules?: unknown }
    : { modules: saved }

  return {
    version: 1,
    density: value.density === 'compact' ? 'compact' : 'comfortable',
    modules: normalizePanoramaModules(value.modules),
  }
}

interface CostObjectSummary {
  id: string
  code: string
  name: string
  objectType: string
  unit: string
  status: string
  costs: Array<{
    id: string
    materialCostPerUnit: number
    laborHoursPerUnit: number
    machineHoursPerUnit: number
    directCostPerUnit: number
    effectiveFrom: string
  }>
  bomItems: Array<{
    id: string
    quantity: number
    unit: string
    bom: { product: { id: string; sku: string; name: string; unit: string } }
  }>
}

interface LocationBalance {
  id: string
  locationCode: string
  locationName: string
  qty: number
  reservedQty: number
  availableQty: number
  note?: string
}

interface PanoramaData {
  material: MaterialSummary
  stock?: StockSummary | null
  locationBalances: LocationBalance[]
  attachments: {
    images: AttachmentItem[]
    documents: AttachmentItem[]
    workInstructions: AttachmentItem[]
  }
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

const materialCategoryLabels: Record<string, string> = {
  RAW: '原材料',
  FINISHED: '成品',
  AUXILIARY: '辅材',
  SCRAP: '废料',
  DEFECTIVE: '废品',
  PACKAGING: '包装物',
  OTHER: '其他',
}

const processCategoryLabels: Record<string, string> = {
  SAWING: '锯切',
  DRILLING: '钻孔',
  TURNING: '车削',
  MILLING: '铣削',
  GRINDING: '磨削',
  HEAT_TREATMENT: '热处理',
  SURFACE_TREATMENT: '表面处理',
  ASSEMBLY: '装配',
  INSPECTION: '检验',
  OTHER: '其他',
}

const statusLabels: Record<string, string> = {
  ACTIVE: '启用',
  ARCHIVED: '停用',
  DRAFT: '草稿',
  CONFIRMED: '已确认',
  PICKED: '已领料',
  IN_PROGRESS: '生产中',
  QC_DONE: '质检完成',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  PENDING: '待处理',
  RECEIVED: '已入库',
  REJECTED: '已拒收',
  REVERSED: '已红冲',
}

function formatNumber(value: number | null | undefined, digits = 3) {
  const numberValue = Number(value || 0)
  return numberValue.toLocaleString('zh-CN', {
    maximumFractionDigits: digits,
  })
}

function formatMoney(value: number | null | undefined) {
  return `¥${Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN')
}

function compactDate(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('zh-CN')
}

function processCostPerThousand(item: {
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
}) {
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

function statusText(status: string) {
  return statusLabels[status] || status
}

function documentCategoryText(category: WorkInstructionSummary['category']) {
  return category.parent ? `${category.parent.name} / ${category.name}` : category.name
}

function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: string
  children: ReactNode
}) {
  const density = useContext(PanoramaDensityContext)
  const paddingClass = density === 'compact' ? 'p-2.5 sm:p-3' : 'p-3 sm:p-4'
  const headerClass = density === 'compact' ? 'mb-2' : 'mb-2.5'

  return (
    <section className={`self-start rounded-lg border border-gray-200 bg-white shadow-sm ${paddingClass}`}>
      <div className={`flex items-center justify-between gap-3 ${headerClass}`}>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {action && <span className="text-xs text-gray-500">{action}</span>}
      </div>
      {children}
    </section>
  )
}

function Metric({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'green' | 'blue' | 'amber'
}) {
  const density = useContext(PanoramaDensityContext)
  const toneClass = {
    default: 'text-gray-900',
    green: 'text-green-700',
    blue: 'text-blue-700',
    amber: 'text-amber-700',
  }[tone]
  const boxClass = density === 'compact' ? 'px-2.5 py-1.5' : 'px-3 py-2'
  const valueClass = density === 'compact' ? 'text-sm sm:text-base' : 'text-base sm:text-lg'

  return (
    <div className={`min-w-0 rounded-md bg-gray-50 ${boxClass}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-0.5 truncate font-semibold ${valueClass} ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 truncate text-xs text-gray-500">{hint}</div>}
    </div>
  )
}

function EmptyText({ children }: { children: React.ReactNode }) {
  const density = useContext(PanoramaDensityContext)
  const paddingClass = density === 'compact' ? 'px-3 py-2' : 'px-3 py-3'

  return (
    <div className={`rounded-md border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500 ${paddingClass}`}>
      {children}
    </div>
  )
}

function AttachmentList({ items }: { items: AttachmentItem[] }) {
  const density = useContext(PanoramaDensityContext)
  if (items.length === 0) return <EmptyText>暂无相关附件</EmptyText>

  return (
    <div className={density === 'compact' ? 'space-y-1.5' : 'space-y-2'}>
      {items.slice(0, 8).map((item) => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-gray-100 px-3 py-2 text-sm hover:bg-gray-50"
        >
          <span className="min-w-0 truncate text-gray-800">{item.originalName}</span>
          <span className="shrink-0 text-xs text-gray-500">{item.mimeType.includes('pdf') ? 'PDF' : item.documentType}</span>
        </a>
      ))}
    </div>
  )
}

function ProcessRouteList({ routes }: { routes: ProcessRouteSummary[] }) {
  const density = useContext(PanoramaDensityContext)
  const steps = routes.flatMap((route) => route.steps.map((step) => ({ ...step, routeName: route.name })))
  if (steps.length === 0) return <EmptyText>暂无工艺步骤或作业说明</EmptyText>

  return (
    <div className={density === 'compact' ? 'space-y-1.5' : 'space-y-2'}>
      {steps.slice(0, 10).map((step) => (
        <div key={`${step.routeName}-${step.id}`} className={`rounded-md border border-gray-100 px-3 ${density === 'compact' ? 'py-1.5' : 'py-2'}`}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded bg-blue-50 px-2 py-0.5 font-mono text-xs text-blue-700">{step.stepNo}</span>
            <span className="font-medium text-gray-900">{step.name}</span>
            <span className="text-xs text-gray-500">{step.workstation || '未设工位'}</span>
          </div>
          {step.description && <div className="mt-1 whitespace-pre-wrap text-xs text-gray-500">{step.description}</div>}
        </div>
      ))}
    </div>
  )
}

function ProcessTemplateList({ templates }: { templates: ProcessTemplateSummary[] }) {
  const density = useContext(PanoramaDensityContext)
  if (templates.length === 0) return <EmptyText>暂未给该物料关联加工工艺</EmptyText>
  return (
    <div className={density === 'compact' ? 'space-y-1.5' : 'space-y-2'}>
      {templates.map((template) => (
        <div key={template.id} className={`rounded-md border border-gray-100 px-3 ${density === 'compact' ? 'py-1.5' : 'py-2'}`}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">{processCategoryLabels[template.category] || template.category}</span>
            <span className="font-medium text-gray-900">{template.name}</span>
            <span className="font-mono text-xs text-gray-400">{template.code}</span>
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {template.workstation || '未设工位'}{template.defaultTime ? ` · ${template.defaultTime} 分钟` : ''}
          </div>
          {(() => {
            const totals = processCostPerThousand(template)
            return (
              <div className="mt-2 grid grid-cols-3 gap-2 rounded bg-blue-50 p-2 text-xs text-blue-800">
                <span>千件人工<br /><b>{formatNumber(totals.laborHours, 2)} h</b></span>
                <span>千件机时<br /><b>{formatNumber(totals.machineHours, 2)} h</b></span>
                <span>千件成本<br /><b>{formatMoney(totals.cost)}</b></span>
              </div>
            )
          })()}
          {template.description && <div className="mt-1 whitespace-pre-wrap text-xs text-gray-500">{template.description}</div>}
        </div>
      ))}
    </div>
  )
}

export default function MaterialPanoramaPage({
  materialId,
  onClose,
  onMessage,
}: {
  materialId: string
  onClose: () => void
  onMessage: (msg: string) => void
}) {
  const [data, setData] = useState<PanoramaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewer, setViewer] = useState<{ instruction: WorkInstructionSummary; attachments: AttachmentItem[]; index: number } | null>(null)
  const [viewerZoom, setViewerZoom] = useState(1)
  const [rotationSaving, setRotationSaving] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [layoutConfig, setLayoutConfig] = useState<PanoramaLayoutConfig>(defaultPanoramaLayout)
  const moduleConfig = layoutConfig.modules

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(panoramaLayoutStorageKey)
      if (saved) setLayoutConfig(normalizePanoramaLayout(JSON.parse(saved)))
    } catch (err) {
      setLayoutConfig(defaultPanoramaLayout)
    }
  }, [])

  const updateLayoutConfig = (nextConfig: PanoramaLayoutConfig) => {
    const normalized = normalizePanoramaLayout(nextConfig)
    setLayoutConfig(normalized)
    window.localStorage.setItem(panoramaLayoutStorageKey, JSON.stringify(normalized))
  }

  const updateModuleConfig = (nextConfig: PanoramaModuleConfig[]) => {
    const normalized = normalizePanoramaModules(nextConfig)
    updateLayoutConfig({ ...layoutConfig, modules: normalized })
  }

  const updateDensity = (density: PanoramaDisplayDensity) => {
    updateLayoutConfig({ ...layoutConfig, density })
  }

  const updateModuleWidth = (id: PanoramaModuleId, width: PanoramaModuleWidth) => {
    updateModuleConfig(moduleConfig.map((item) => item.id === id ? { ...item, width } : item))
  }

  const toggleModule = (id: PanoramaModuleId) => {
    updateModuleConfig(moduleConfig.map((item) => item.id === id ? { ...item, visible: !item.visible } : item))
  }

  const moveModule = (id: PanoramaModuleId, direction: -1 | 1) => {
    const index = moduleConfig.findIndex((item) => item.id === id)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= moduleConfig.length) return
    const nextConfig = [...moduleConfig]
    const [item] = nextConfig.splice(index, 1)
    nextConfig.splice(nextIndex, 0, item)
    updateModuleConfig(nextConfig)
  }

  const resetModuleLayout = () => {
    updateLayoutConfig(defaultPanoramaLayout)
  }

  useEffect(() => {
    const controller = new AbortController()
    const fetchPanorama = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/materials/${materialId}/panorama`, { signal: controller.signal })
        const json = await res.json()
        if (!res.ok) {
          const message = json.error || '获取物料全景失败'
          setError(message)
          onMessage(message)
          return
        }
        setData(json.data)
      } catch (err) {
        if (!controller.signal.aborted) {
          setError('获取物料全景失败')
          onMessage('获取物料全景失败')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    fetchPanorama()
    return () => controller.abort()
  }, [materialId, onMessage])

  const relatedRoutes = useMemo(() => {
    if (!data) return []
    const map = new Map<string, ProcessRouteSummary>()
    for (const bom of data.productBoms) {
      for (const route of bom.product.processRoutes || []) map.set(route.id, route)
    }
    for (const bom of data.componentBoms) {
      for (const route of bom.bom.product.processRoutes || []) map.set(route.id, route)
    }
    for (const order of data.targetOrders) {
      for (const route of order.product.processRoutes || []) map.set(route.id, route)
    }
    return Array.from(map.values())
  }, [data])
  const relatedRouteCost = useMemo(() => {
    const steps = relatedRoutes.flatMap((route) => route.steps)
    return steps.reduce((sum, step) => {
      const totals = processCostPerThousand(step)
      return {
        laborHours: sum.laborHours + totals.laborHours,
        machineHours: sum.machineHours + totals.machineHours,
        cost: sum.cost + totals.cost,
      }
    }, { laborHours: 0, machineHours: 0, cost: 0 })
  }, [relatedRoutes])

  const coverImage = data?.attachments.images.find((item) => item.isCover) || data?.attachments.images[0]
  const material = data?.material
  const stock = data?.stock
  const selectedViewerAttachment = viewer?.attachments[viewer.index]
  const visibleModuleCount = moduleConfig.filter((item) => item.visible).length
  const densityText = layoutConfig.density === 'compact' ? '紧凑' : '舒适'
  const contentGapClass = layoutConfig.density === 'compact' ? 'gap-2' : 'gap-3'
  const contentPaddingClass = layoutConfig.density === 'compact' ? 'p-2 sm:p-3' : 'p-3 sm:p-4'

  const openWorkInstructionViewer = (instruction: WorkInstructionSummary) => {
    if (!instruction.attachments || instruction.attachments.length === 0) {
      onMessage('这条产品文档还没有上传图片或 PDF')
      return
    }
    setViewer({ instruction, attachments: instruction.attachments, index: 0 })
    setViewerZoom(1)
  }

  const saveSelectedAttachmentRotation = async (delta: number) => {
    if (!selectedViewerAttachment || rotationSaving) return
    const nextRotation = normalizeAttachmentRotation(Number(selectedViewerAttachment.rotation || 0) + delta)
    setRotationSaving(true)
    try {
      const res = await fetch('/api/attachments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedViewerAttachment.id,
          action: 'SET_ROTATION',
          rotation: nextRotation,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        onMessage(result.error || '保存文件方向失败')
        return
      }
      const updated = result.data as AttachmentItem
      setViewer((current) => current ? {
        ...current,
        attachments: current.attachments.map((attachment) => attachment.id === updated.id ? updated : attachment),
      } : current)
      setData((current) => current ? {
        ...current,
        attachments: {
          images: current.attachments.images.map((attachment) => attachment.id === updated.id ? updated : attachment),
          documents: current.attachments.documents.map((attachment) => attachment.id === updated.id ? updated : attachment),
          workInstructions: current.attachments.workInstructions.map((attachment) => attachment.id === updated.id ? updated : attachment),
        },
        workInstructions: current.workInstructions.map((instruction) => ({
          ...instruction,
          attachments: instruction.attachments.map((attachment) => attachment.id === updated.id ? updated : attachment),
        })),
      } : current)
      onMessage(result.message || '文件方向已保存')
    } catch (err) {
      onMessage('保存文件方向失败')
    } finally {
      setRotationSaving(false)
    }
  }

  const renderLayoutModule = (id: PanoramaModuleId, children: ReactNode) => {
    const index = moduleConfig.findIndex((item) => item.id === id)
    const moduleItem = index >= 0 ? moduleConfig[index] : defaultPanoramaModules.find((item) => item.id === id)
    if (!moduleItem?.visible) return null

    return (
      <div
        key={id}
        className={`min-w-0 ${panoramaModuleWidthClasses[moduleItem.width]}`}
        style={{ order: index >= 0 ? index : 99 }}
      >
        {children}
      </div>
    )
  }

  return (
    <PanoramaDensityProvider value={layoutConfig.density}>
    <div className="fixed inset-0 z-[60] mes-modal-overlay-dark p-2 sm:p-4">
      <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col overflow-hidden rounded-lg bg-gray-50 shadow-xl">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-2.5 sm:px-5">
          <div className="min-w-0">
            <div className="text-xs text-gray-500">物料全景视图</div>
            <div className="mt-0.5 truncate text-lg font-semibold text-gray-900">
              {material ? `${material.code} · ${material.name}` : '加载中'}
            </div>
            <div className="mt-1 text-xs text-gray-500">{densityText}布局 · 显示 {visibleModuleCount}/{defaultPanoramaModules.length} 个模块</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setLayoutOpen(true)}
              className="rounded-md border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
            >
              布局
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              关闭
            </button>
          </div>
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto ${contentPaddingClass}`}>
          {loading && (
            <div className="rounded-lg bg-white px-4 py-12 text-center text-sm text-gray-500 shadow-sm">
              正在加载物料全景...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && data && material && (
            <div className={`grid grid-cols-1 ${contentGapClass} xl:grid-cols-12`}>
              {data.integrityWarnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 xl:col-span-12">
                  {data.integrityWarnings.join('；')}
                </div>
              )}

              {renderLayoutModule('summary', (
              <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
                <Panel title="物料档案">
                  <div className="grid gap-4 md:grid-cols-[160px_minmax(0,1fr)]">
                    <a
                      href={coverImage?.url}
                      target={coverImage ? '_blank' : undefined}
                      rel={coverImage ? 'noreferrer' : undefined}
                      className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-gray-100"
                    >
                      {coverImage ? (
                        <img src={coverImage.url} alt={coverImage.note || material.name} className="h-full w-full object-contain" />
                      ) : (
                        <span className="text-sm text-gray-400">暂无图片</span>
                      )}
                    </a>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-blue-50 px-2 py-1 font-mono text-xs text-blue-700">{material.code}</span>
                        <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{materialCategoryLabels[material.category] || material.category}</span>
                        <span className="rounded bg-green-50 px-2 py-1 text-xs text-green-700">{material.costingMethod === 'FIFO' ? 'FIFO' : '移动加权'}</span>
                      </div>
                      <h2 className="mt-2 text-xl font-semibold text-gray-900">{material.name}</h2>
                      <div className="mt-2 grid gap-x-4 gap-y-1.5 text-sm text-gray-600 sm:grid-cols-2">
                        <div>规格：{material.spec || '-'}</div>
                        <div>客户：{material.customer?.name || '通用/未绑定'}</div>
                        <div>库存单位：{material.stockUnit || material.unit}</div>
                        <div>核算单位：{material.valuationUnit}</div>
                        <div className="sm:col-span-2">换算：1 {material.stockUnit || material.unit} = {formatNumber(material.conversionRate, 6)} {material.valuationUnit}</div>
                        <div className="sm:col-span-2">创建时间：{formatDate(material.createdAt)}</div>
                      </div>
                      {material.note && <div className="mt-3 whitespace-pre-wrap rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">备注：{material.note}</div>}
                    </div>
                  </div>
                </Panel>

                <Panel title="库存总览" action={stock ? '实时余额' : '缺少库存记录'}>
                  <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                    <Metric label="当前库存" value={`${formatNumber(stock?.qty)} ${material.stockUnit || material.unit}`} />
                    <Metric label="可用库存" value={`${formatNumber(stock?.availableQty)} ${material.stockUnit || material.unit}`} tone="green" />
                    <Metric label="已占用" value={`${formatNumber(stock?.reservedQty)} ${material.stockUnit || material.unit}`} tone="amber" />
                    <Metric label="核算库存" value={`${formatNumber(stock?.valuationQty)} ${material.valuationUnit}`} />
                    <Metric label="库存金额" value={formatMoney(stock?.totalCost)} tone="blue" />
                    <Metric
                      label="当前单价"
                      value={`${formatMoney(stock?.stockUnitCost)} / ${material.stockUnit || material.unit}`}
                      hint={`${formatMoney(stock?.valuationUnitCost)} / ${material.valuationUnit}`}
                    />
                  </div>
                </Panel>
              </div>
              ))}

              {renderLayoutModule('documents', (
              <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]">
                <Panel title="库位分布" action="实物数量按库位">
                  {data.locationBalances.length === 0 ? (
                    <EmptyText>暂无库存余额记录</EmptyText>
                  ) : (
                    <div className="space-y-2">
                      {data.locationBalances.map((location) => (
                        <div key={location.id} className="rounded-md border border-gray-100 px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="font-medium text-gray-900">{location.locationName}</div>
                              <div className="mt-0.5 text-xs text-gray-500">{location.locationCode}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold text-gray-900">{formatNumber(location.qty)} {material.stockUnit || material.unit}</div>
                              <div className="text-xs text-green-700">可用 {formatNumber(location.availableQty)} {material.stockUnit || material.unit}</div>
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-gray-500">占用 {formatNumber(location.reservedQty)} {material.stockUnit || material.unit}；成本仍按物料总库存统一核算</div>
                          {location.note && <div className="mt-1 text-xs text-gray-500">{location.note}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>

                <Panel title="产品文档与相关附件" action={`${data.workInstructions.length} 条产品文档`}>
                  <div className="space-y-3">
                    <div>
                      <div className="mb-2 text-xs font-medium text-gray-500">正式产品文档</div>
                      {data.workInstructions.length === 0 ? (
                        <EmptyText>暂无直接关联到该产品的文档</EmptyText>
                      ) : (
                        <div className="space-y-2">
                          {data.workInstructions.map((instruction) => {
                            const previewAttachment = instruction.attachments.find((attachment) => attachment.mimeType.startsWith('image/'))
                              || instruction.attachments[0]
                            return (
                              <div key={instruction.id} className="flex items-start gap-3 rounded-md border border-gray-100 px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => openWorkInstructionViewer(instruction)}
                                  disabled={!previewAttachment}
                                  className="w-24 shrink-0 text-left disabled:cursor-not-allowed"
                                >
                                  <DocumentPreviewThumb attachment={previewAttachment} title={instruction.material.name} />
                                </button>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium text-gray-900">{instruction.material.name}</div>
                                      <div className="mt-0.5 font-mono text-xs text-blue-700">{instruction.material.code} · {instruction.version}</div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{documentCategoryText(instruction.category)}</span>
                                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{statusText(instruction.status)}</span>
                                      <button
                                        type="button"
                                        onClick={() => openWorkInstructionViewer(instruction)}
                                        disabled={!previewAttachment}
                                        className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
                                      >
                                        全屏打开
                                      </button>
                                    </div>
                                  </div>
                                  <div className="mt-1 text-xs text-gray-500">
                                    客户：{instruction.material.customer?.name || '通用产品'} · 文件：{instruction.imageCount} 图 / {instruction.pdfCount} PDF
                                  </div>
                                  <div className="mt-1 line-clamp-2 text-xs text-gray-500">工作中心：{instruction.workCenters.length > 0 ? instruction.workCenters.map((item) => item.name).join('、') : '不限'}</div>
                                  {instruction.note && <div className="mt-1 line-clamp-2 text-xs text-gray-500">备注：{instruction.note}</div>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-medium text-gray-500">物料旧附件文档</div>
                      <AttachmentList items={data.attachments.documents.filter((item) => !data.attachments.workInstructions.some((doc) => doc.id === item.id))} />
                    </div>
                  </div>
                </Panel>
              </div>
              ))}

              {renderLayoutModule('bomProcess', (
              <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
                <Panel title="相关 BOM" action={`作为目标物料 ${data.productBoms.length} 个，作为用料 ${data.componentBoms.length} 个`}>
                  <div className="space-y-4">
                    <div>
                      <div className="mb-2 text-xs font-medium text-gray-500">该物料对应 BOM</div>
                      {data.productBoms.length === 0 ? (
                        <EmptyText>未找到与物料编码直接对应的 BOM</EmptyText>
                      ) : (
                        <div className="space-y-2">
                          {data.productBoms.map((bom) => (
                            <div key={bom.id} className="rounded-md border border-gray-100 px-3 py-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <div className="font-medium text-gray-900">{bom.product.name}</div>
                                  <div className="mt-0.5 font-mono text-xs text-blue-700">{bom.product.sku} · {bom.version}</div>
                                </div>
                                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{bom.isActive ? '启用' : '停用'}</span>
                              </div>
                              <div className="mt-2 space-y-1 text-xs text-gray-600">
                                {bom.items.slice(0, 6).map((item) => (
                                  <div key={item.id} className="flex min-w-0 justify-between gap-2">
                                    <span className="truncate">
                                      {item.material ? `${item.material.code} · ${item.material.name}` : item.costObject ? `${item.costObject.code} · ${item.costObject.name}` : item.sawingScenario?.name || item.itemType || 'BOM项'}
                                    </span>
                                    <span className="shrink-0">
                                      {item.material
                                        ? (item.quantity > 0 ? `换算比例 ${formatNumber(item.quantity, 6)} ${item.unit}原料/${bom.product.unit || '单位'}成品` : '待填写换算比例')
                                        : `${formatNumber(item.quantity, 6)} ${item.unit}`}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              {bom.latestCostRun && <div className="mt-2 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">最新 BOM 单位成本 {formatMoney(bom.latestCostRun.unitCost)} / {bom.product.unit}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="mb-2 text-xs font-medium text-gray-500">哪些 BOM 使用了该物料</div>
                      {data.componentBoms.length === 0 ? (
                        <EmptyText>暂无 BOM 使用此物料</EmptyText>
                      ) : (
                        <div className="space-y-2">
                          {data.componentBoms.map((item) => (
                            <div key={item.id} className="rounded-md border border-gray-100 px-3 py-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <div className="font-medium text-gray-900">{item.bom.product.name}</div>
                                  <div className="mt-0.5 font-mono text-xs text-blue-700">{item.bom.product.sku} · {item.bom.version}</div>
                                </div>
                                <div className={`rounded px-2 py-1 text-xs ${item.quantity > 0 ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                                  {item.quantity > 0
                                    ? `换算比例 ${formatNumber(item.quantity, 6)} ${item.unit}原料/${item.bom.product.unit || '单位'}成品`
                                    : '待填写换算比例'}
                                </div>
                              </div>
                              <div className="mt-1 text-xs text-gray-500">实际耗用在生产日报中按主库存单位记录</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Panel>

                <Panel title="加工工艺/作业步骤" action={`${data.processTemplates.length} 个工艺 · ${relatedRoutes.length} 条路线`}>
                  <div className="space-y-4">
                    <div><div className="mb-2 text-xs font-medium text-gray-500">物料直接关联的加工工艺</div><ProcessTemplateList templates={data.processTemplates} /></div>
                    <div><div className="mb-2 text-xs font-medium text-gray-500">BOM 推导的工艺路线</div><ProcessRouteList routes={relatedRoutes} /></div>
                  </div>
                </Panel>
              </div>
              ))}

              {renderLayoutModule('costing', (
              <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
                <Panel title="加工参数与成本对象" action={`${data.costObjects.length} 个成本对象`}>
                  <div className="grid grid-cols-3 gap-2">
                    <Metric label="千件人工" value={`${formatNumber(relatedRouteCost.laborHours, 2)} h`} tone="blue" />
                    <Metric label="千件机时" value={`${formatNumber(relatedRouteCost.machineHours, 2)} h`} tone="amber" />
                    <Metric label="路线成本" value={formatMoney(relatedRouteCost.cost)} tone="green" />
                  </div>
                  <div className="mt-4 space-y-2">
                    {data.costObjects.length === 0 ? (
                      <EmptyText>暂无直接或 BOM 推导的成本对象</EmptyText>
                    ) : data.costObjects.map((costObject) => {
                      const activeCost = costObject.costs[0]
                      return (
                        <div key={costObject.id} className="rounded-md border border-gray-100 px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="font-medium text-gray-900">{costObject.name}</div>
                              <div className="mt-0.5 font-mono text-xs text-blue-700">{costObject.code} · {costObject.objectType}</div>
                            </div>
                            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{costObject.unit}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600 sm:grid-cols-4">
                            <span>材料 {formatMoney(activeCost?.materialCostPerUnit)}</span>
                            <span>人工 {formatNumber(activeCost?.laborHoursPerUnit, 4)}h</span>
                            <span>机时 {formatNumber(activeCost?.machineHoursPerUnit, 4)}h</span>
                            <span>直接费 {formatMoney(activeCost?.directCostPerUnit)}</span>
                          </div>
                          <div className="mt-1 text-xs text-gray-500">BOM 使用：{costObject.bomItems.length ? costObject.bomItems.map((item) => item.bom.product.sku).join('、') : '暂无'}</div>
                        </div>
                      )
                    })}
                  </div>
                </Panel>

                <Panel title="物料成本快照" action={`${data.productBoms.filter((bom) => bom.latestCostRun).length} 个物料有成本`}>
                  {data.productBoms.length === 0 ? (
                    <EmptyText>暂无与该物料对应的 BOM</EmptyText>
                  ) : (
                    <div className="space-y-2">
                      {data.productBoms.map((bom) => (
                        <div key={bom.id} className="rounded-md border border-gray-100 px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="font-medium text-gray-900">{bom.product.name}</div>
                              <div className="mt-0.5 font-mono text-xs text-blue-700">{bom.product.sku} · {bom.version}</div>
                            </div>
                            <div className="text-right text-xs">
                              {bom.latestCostRun ? (
                                <>
                                  <div className="font-semibold text-blue-700">{formatMoney(bom.latestCostRun.unitCost)} / {bom.product.unit}</div>
                                  <div className="mt-0.5 text-gray-500">{compactDate(bom.latestCostRun.createdAt)}</div>
                                </>
                              ) : <span className="text-gray-500">暂无成本快照</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              </div>
              ))}

              {renderLayoutModule('orders', (
              <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
                <Panel title="相关工单" action={`目标工单 ${data.targetOrders.length} 个`}>
                  {data.targetOrders.length === 0 ? (
                    <EmptyText>暂无以该物料为目标的工单</EmptyText>
                  ) : (
                    <div className="space-y-2">
                      {data.targetOrders.map((order) => (
                        <div key={order.id} className="rounded-md border border-gray-100 px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="font-mono text-sm font-semibold text-blue-700">{order.orderNo}</div>
                              <div className="mt-0.5 text-xs text-gray-500">{order.voucherNo ? `凭据号 ${order.voucherNo}` : '无凭据号'} · {compactDate(order.createdAt)}</div>
                            </div>
                            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{statusText(order.status)}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-600">
                            <span>计划 {formatNumber(order.planQty, 0)}</span>
                            <span>完成 {formatNumber(order.completeQty, 0)}</span>
                            <span>报废 {formatNumber(order.scrapQty, 0)}</span>
                          </div>
                          {order._count && (
                            <div className="mt-1 text-xs text-gray-500">
                              领料 {order._count.picks} · 报工 {order._count.reports} · 派工 {order._count.dispatches} · 入库 {order._count.stockIns}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>

                <Panel title="作为用料的领料记录" action={`${data.consumingPicks.length} 条`}>
                  {data.consumingPicks.length === 0 ? (
                    <EmptyText>暂无领料消耗记录</EmptyText>
                  ) : (
                    <div className="space-y-2">
                      {data.consumingPicks.map((pick) => (
                        <div key={pick.id} className="rounded-md border border-gray-100 px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="font-mono text-sm font-semibold text-blue-700">{pick.order.orderNo}</div>
                              <div className="mt-0.5 text-xs text-gray-500">{pick.order.targetMaterial?.name || pick.order.product.name}</div>
                            </div>
                            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{statusText(pick.status)}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600 sm:grid-cols-4">
                            <span>需求 {formatNumber(pick.requiredQty)}</span>
                            <span>实领 {formatNumber(pick.actualQty)}</span>
                            <span>核算 {formatNumber(pick.actualValuationQty)}</span>
                            <span>成本 {formatMoney(pick.costAmount)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              </div>
              ))}

              {renderLayoutModule('records', (
              <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-3">
                <Panel title="最近来料" action={`${data.recentMaterialIns.length} 条`}>
                  {data.recentMaterialIns.length === 0 ? (
                    <EmptyText>暂无来料记录</EmptyText>
                  ) : (
                    <div className="space-y-2">
                      {data.recentMaterialIns.map((item) => (
                        <div key={item.id} className="rounded-md border border-gray-100 px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-mono text-blue-700">{item.inboundNo}</span>
                            <span className="shrink-0 text-xs text-gray-500">{statusText(item.status)}</span>
                          </div>
                          <div className="mt-1 text-xs text-gray-600">{item.supplier.name} · {formatNumber(item.qty)} {item.unit} · {formatMoney(item.totalAmount)}</div>
                          <div className="mt-1 text-xs text-gray-500">{compactDate(item.inboundDate)} · 批次 {item.batchNo || '-'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>

                <Panel title="最近库存流水" action={`${data.recentStockLogs.length} 条`}>
                  {data.recentStockLogs.length === 0 ? (
                    <EmptyText>暂无库存流水</EmptyText>
                  ) : (
                    <div className="space-y-2">
                      {data.recentStockLogs.map((log) => (
                        <div key={log.id} className="rounded-md border border-gray-100 px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-gray-900">{log.type}</span>
                            <span className="text-xs text-gray-500">{compactDate(log.createdAt)}</span>
                          </div>
                          <div className="mt-1 text-xs text-gray-600">
                            {formatNumber(log.beforeQty)} {'->'} {formatNumber(log.afterQty)}，变化 {formatNumber(log.qty)}
                          </div>
                          {log.note && <div className="mt-1 line-clamp-2 text-xs text-gray-500">{log.note}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>

                <Panel title="成本层" action={`${data.costLayers.length} 层`}>
                  {data.costLayers.length === 0 ? (
                    <EmptyText>暂无 FIFO 成本层记录</EmptyText>
                  ) : (
                    <div className="space-y-2">
                      {data.costLayers.map((layer) => (
                        <div key={layer.id} className="rounded-md border border-gray-100 px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-gray-900">{layer.status}</span>
                            <span className="text-xs text-gray-500">{compactDate(layer.createdAt)}</span>
                          </div>
                          <div className="mt-1 text-xs text-gray-600">
                            剩余 {formatNumber(layer.remainingStockQty)} {layer.stockUnit} / {formatNumber(layer.remainingValuationQty)} {layer.valuationUnit}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">金额 {formatMoney(layer.remainingAmount)} · {formatMoney(layer.stockUnitCost)} / {layer.stockUnit}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              </div>
              ))}

              {renderLayoutModule('notes', (
              <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500">
                {data.modelNotes.join('；')}
              </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {layoutOpen && (
        <ModalOverlay onClose={() => setLayoutOpen(false)} className="z-[75]">
          <div className="flex max-h-[calc(100vh-32px)] w-[min(calc(100vw-24px),780px)] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">全景模块布局</h3>
                <p className="mt-1 text-sm text-gray-500">调整模块显示、宽度和顺序，设置保存在当前浏览器。</p>
              </div>
              <button
                type="button"
                onClick={() => setLayoutOpen(false)}
                className="rounded px-2 py-1 text-xl leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                <div className="mb-2 text-sm font-medium text-gray-900">显示密度</div>
                <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => updateDensity('comfortable')}
                    className={`rounded-md px-3 py-1.5 text-sm ${layoutConfig.density === 'comfortable' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    舒适
                  </button>
                  <button
                    type="button"
                    onClick={() => updateDensity('compact')}
                    className={`rounded-md px-3 py-1.5 text-sm ${layoutConfig.density === 'compact' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    紧凑
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {moduleConfig.map((module, index) => {
                  const meta = panoramaModuleLabels[module.id]
                  return (
                    <div key={module.id} className="grid gap-3 rounded-lg border border-gray-200 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_128px_112px]">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          aria-label={`${meta.name}模块显示`}
                          checked={module.visible}
                          onChange={() => toggleModule(module.id)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-900">{meta.name}</span>
                          <span className="mt-0.5 block text-xs text-gray-500">{meta.description}</span>
                        </span>
                      </label>
                      <label className="min-w-0 text-xs text-gray-500">
                        <span className="mb-1 block">宽度</span>
                        <select
                          aria-label={`${meta.name}模块宽度`}
                          value={module.width}
                          onChange={(event) => updateModuleWidth(module.id, event.target.value as PanoramaModuleWidth)}
                          className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700"
                        >
                          {(Object.keys(panoramaModuleWidthLabels) as PanoramaModuleWidth[]).map((width) => (
                            <option key={width} value={width}>{panoramaModuleWidthLabels[width]}</option>
                          ))}
                        </select>
                      </label>
                      <div className="flex shrink-0 items-end gap-1">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => moveModule(module.id, -1)}
                          className="rounded-md border border-gray-200 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          上移
                        </button>
                        <button
                          type="button"
                          disabled={index === moduleConfig.length - 1}
                          onClick={() => moveModule(module.id, 1)}
                          className="rounded-md border border-gray-200 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          下移
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="flex shrink-0 justify-between gap-3 border-t bg-gray-50 px-5 py-4">
              <button
                type="button"
                onClick={resetModuleLayout}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-white"
              >
                恢复默认
              </button>
              <button
                type="button"
                onClick={() => setLayoutOpen(false)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                完成
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
      {viewer && selectedViewerAttachment && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-slate-950 text-white">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2 sm:px-4">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{viewer.instruction.material.code} · {viewer.instruction.material.name}</div>
              <div className="truncate text-xs text-white/60">
                {selectedViewerAttachment.originalName} · {formatSize(selectedViewerAttachment.size)} · {viewer.index + 1}/{viewer.attachments.length}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button onClick={() => setViewer({ ...viewer, index: Math.max(0, viewer.index - 1) })} disabled={viewer.index <= 0} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">上一份</button>
              <button onClick={() => setViewer({ ...viewer, index: Math.min(viewer.attachments.length - 1, viewer.index + 1) })} disabled={viewer.index >= viewer.attachments.length - 1} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">下一份</button>
              <button onClick={() => setViewerZoom((value) => Math.max(0.25, Number((value - 0.25).toFixed(2))))} className="rounded border border-white/20 px-3 py-1.5 text-sm">缩小</button>
              <button onClick={() => setViewerZoom((value) => Math.min(4, Number((value + 0.25).toFixed(2))))} className="rounded border border-white/20 px-3 py-1.5 text-sm">放大</button>
              <button onClick={() => void saveSelectedAttachmentRotation(-90)} disabled={rotationSaving} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">左转并保存</button>
              <button onClick={() => void saveSelectedAttachmentRotation(90)} disabled={rotationSaving} className="rounded border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40">右转并保存</button>
              <button onClick={() => setViewerZoom(1)} className="rounded border border-white/20 px-3 py-1.5 text-sm">适合页面</button>
              <a href={selectedViewerAttachment.url} target="_blank" rel="noreferrer" className="rounded border border-white/20 px-3 py-1.5 text-sm">新窗口</a>
              <button onClick={() => setViewer(null)} className="rounded bg-white px-3 py-1.5 text-sm text-slate-900">关闭</button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {selectedViewerAttachment.mimeType.startsWith('image/') ? (
              <div className="flex h-full w-full items-center justify-center overflow-auto p-4">
                <img
                  src={selectedViewerAttachment.url}
                  alt={selectedViewerAttachment.originalName}
                  className="max-h-full max-w-full object-contain"
                  style={{
                    transform: `rotate(${selectedViewerAttachment.rotation || 0}deg) scale(${viewerZoom})`,
                    transformOrigin: 'center center',
                  }}
                />
              </div>
            ) : (
              <PdfDocumentViewer
                url={selectedViewerAttachment.url}
                title={selectedViewerAttachment.originalName}
                rotation={selectedViewerAttachment.rotation}
                zoom={viewerZoom}
              />
            )}
          </div>
          {selectedViewerAttachment.mimeType === 'application/pdf' && (
            <div className="shrink-0 border-t border-white/10 px-4 py-2 text-xs text-white/60">
              PDF 多页可纵向滚动；方向调整会保存到当前文件，并同步用于卡片预览和产品文档。
            </div>
          )}
        </div>
      )}
    </div>
    </PanoramaDensityProvider>
  )
}
