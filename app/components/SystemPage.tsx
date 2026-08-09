'use client'

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePersistedViewMode } from './ViewModeToggle'
import MaterialChoiceSearch from './MaterialChoiceSearch'
import useCompactViewport from './useCompactViewport'
import SearchableSelect from './SearchableSelect'
import SortableTableHeader from './SortableTableHeader'
import useClientTableSort from './useClientTableSort'
import AppButton from './AppButton'
import ModalDialog, { ModalActions } from './ModalDialog'
import { appInputClassName, appTextareaClassName } from './FormField'
import ConfigurationManualOrder from './ConfigurationManualOrder'
import AppLoadingIndicator from './AppLoadingIndicator'
import { ResourceAdvancedSearch, ResourcePageShell } from './resource'
import {
  filterByResourceSearch,
  type ResourceAdvancedSearchField,
  type ResourceSearchCondition,
  type ResourceSearchProfile,
} from '@/lib/resource-search'
import ConfigurationSectionPage, { isConfigurationSection } from '@/modules/configuration'
import { isOperationsToolsSection, OperationsToolsSectionPage } from '@/modules/operations-tools'
import { isSystemSettingsSection, SystemSettingsSectionPage } from '@/modules/system-settings'
import type { RegisteredSystemSection } from '@/lib/page-registry'

interface MaterialChoice {
  id: string
  sku: string
  name: string
  category: string
  customerId?: string | null
  customer?: { id: string; code: string; name: string } | null
  unit: string
  createdAt?: string
}

interface ProcessStepForm {
  stepNo: number
  name: string
  defaultTime: number
  workstation: string
  description: string
  templateId: string
  templateCode: string
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

interface ProcessRoute {
  id: string
  productId: string
  name: string
  isDefault: boolean
  sortOrder: number
  product: { id: string; sku: string; name: string }
  steps: Array<{
    id: string
    stepNo: number
    name: string
    defaultTime?: number | null
    workstation?: string | null
    description?: string | null
    templateId?: string | null
    templateCode?: string | null
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
  }>
}

interface ProcessTemplate {
  id: string
  code: string
  name: string
  category: string
  defaultTime?: number | null
  workstation?: string | null
  description?: string | null
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
  isPreset: boolean
  sortOrder: number
  materials: Array<{ id: string; code: string; name: string }>
}

const processCategoryOptions = [
  ['SAWING', '锯切'], ['DRILLING', '钻孔'], ['TURNING', '车削'], ['MILLING', '铣削'], ['GRINDING', '磨削'],
  ['HEAT_TREATMENT', '热处理'], ['SURFACE_TREATMENT', '表面处理'], ['ASSEMBLY', '装配'], ['INSPECTION', '检验'], ['OTHER', '其他'],
] as const

const processCategoryLabel = Object.fromEntries(processCategoryOptions)

function processCostPerThousand(template: ProcessTemplate) {
  const batches = 1000 / Math.max(1, template.standardBatchQty)
  const runHours = (1000 / Math.max(0.000001, template.yieldRate)) * template.cycleTimeSeconds / 3600
  const setupHours = template.setupTimeMinutes / 60 * batches
  const laborHours = (runHours + setupHours) * template.peopleCount
  const machineHours = (runHours + setupHours) * template.machineCount
  const cost = laborHours * template.laborRatePerHour + machineHours * template.machineRatePerHour + runHours * template.energyCostPerHour + batches * template.consumableCostPerBatch
  return { laborHours, machineHours, cost }
}

function routeStepCostPerThousand(step: ProcessRoute['steps'][number] | ProcessStepForm) {
  const batches = 1000 / Math.max(1, step.standardBatchQty)
  const runHours = (1000 / Math.max(0.000001, step.yieldRate)) * step.cycleTimeSeconds / 3600
  const setupHours = step.setupTimeMinutes / 60 * batches
  const laborHours = (runHours + setupHours) * step.peopleCount
  const machineHours = (runHours + setupHours) * step.machineCount
  const cost = laborHours * step.laborRatePerHour + machineHours * step.machineRatePerHour + runHours * step.energyCostPerHour + batches * step.consumableCostPerBatch
  return { laborHours, machineHours, cost }
}

export type SystemSection = RegisteredSystemSection

const systemSectionOrderConfig: Partial<Record<SystemSection, {
  entity: 'processTemplates' | 'processRoutes'
  label: string
}>> = {
  processTemplates: { entity: 'processTemplates', label: '加工工艺' },
  process: { entity: 'processRoutes', label: '物料路线' },
}

const processTemplateSearchProfile: ResourceSearchProfile<ProcessTemplate> = {
  key: 'process-template.default',
  keywordFields: [
    { key: 'code', label: '编码', read: (item) => item.code, weight: 10 },
    { key: 'name', label: '名称', read: (item) => item.name, weight: 8 },
    { key: 'category', label: '类别', read: (item) => processCategoryLabel[item.category] || item.category },
    { key: 'workstation', label: '工位', read: (item) => item.workstation },
    { key: 'materials', label: '关联物料', read: (item) => item.materials.flatMap((material) => [material.code, material.name]) },
  ],
}
const processTemplateAdvancedFields: readonly ResourceAdvancedSearchField<ProcessTemplate>[] = [
  { key: 'code', label: '编码', type: 'text', read: (item) => item.code, operators: ['equals', 'startsWith'] },
  { key: 'name', label: '名称', type: 'text', read: (item) => item.name },
  { key: 'category', label: '类别', type: 'select', read: (item) => item.category, options: processCategoryOptions.map(([value, label]) => ({ value, label })) },
  { key: 'workstation', label: '工位', type: 'text', read: (item) => item.workstation },
]

const processRouteSearchProfile: ResourceSearchProfile<ProcessRoute> = {
  key: 'process-route.default',
  keywordFields: [
    { key: 'material', label: '物料', read: (item) => [item.product?.sku, item.product?.name], weight: 10 },
    { key: 'name', label: '路线名称', read: (item) => item.name, weight: 8 },
    { key: 'steps', label: '工序', read: (item) => item.steps.flatMap((step) => [step.name, step.workstation, step.description]) },
  ],
}
const processRouteAdvancedFields: readonly ResourceAdvancedSearchField<ProcessRoute>[] = [
  { key: 'material', label: '物料', type: 'text', read: (item) => `${item.product?.sku || ''} ${item.product?.name || ''}` },
  { key: 'name', label: '路线名称', type: 'text', read: (item) => item.name },
  { key: 'default', label: '默认路线', type: 'select', read: (item) => item.isDefault ? 'yes' : 'no', options: [{ value: 'yes', label: '是' }, { value: 'no', label: '否' }] },
  { key: 'stepCount', label: '工序数量', type: 'number', read: (item) => item.steps.length },
]

const SystemToolbarExtraContext = createContext<ReactNode>(null)

function SystemResourcePage<T>({
  resourceKey,
  title,
  description,
  summary,
  keyword,
  onKeywordChange,
  searchPlaceholder,
  advancedFields,
  conditions,
  onConditionsChange,
  conditionLabel,
  viewMode,
  onViewModeChange,
  onCreate,
  resourceLabel,
  actions,
  children,
  contentClassName,
}: {
  resourceKey: string
  title: string
  description: string
  summary?: ReactNode
  keyword?: string
  onKeywordChange?: (value: string) => void
  searchPlaceholder?: string
  advancedFields?: readonly ResourceAdvancedSearchField<T>[]
  conditions?: readonly ResourceSearchCondition[]
  onConditionsChange?: (conditions: ResourceSearchCondition[]) => void
  conditionLabel?: string
  viewMode?: 'card' | 'list'
  onViewModeChange?: (value: 'card' | 'list') => void
  onCreate?: () => void
  resourceLabel?: string
  actions?: ReactNode
  children: ReactNode
  contentClassName?: string
}) {
  const manualOrderAction = useContext(SystemToolbarExtraContext)
  return (
    <ResourcePageShell
      resourceKey={resourceKey}
      title={title}
      description={description}
      summary={summary}
      searchValue={keyword}
      onSearchChange={onKeywordChange}
      searchPlaceholder={searchPlaceholder}
      advancedSearch={advancedFields && conditions && onConditionsChange ? (
        <ResourceAdvancedSearch fields={advancedFields} conditions={conditions} onChange={onConditionsChange} />
      ) : undefined}
      searchConditions={conditions}
      onSearchConditionsChange={onConditionsChange}
      searchConditionLabel={conditionLabel}
      viewMode={viewMode}
      onViewModeChange={onViewModeChange}
      displayModes={viewMode ? ['card', 'list'] : undefined}
      onCreate={onCreate}
      resourceLabel={resourceLabel}
      actions={manualOrderAction || actions ? <>{manualOrderAction}{actions}</> : undefined}
      contentClassName={contentClassName}
    >
      {children}
    </ResourcePageShell>
  )
}

export default function SystemPage({
  section,
  onMessage,
}: {
  section: SystemSection
  onMessage: (msg: string) => void
}) {
  const [orderRevision, setOrderRevision] = useState(0)
  const orderConfig = systemSectionOrderConfig[section]
  const manualOrderAction = orderConfig
    ? <ConfigurationManualOrder {...orderConfig} onMessage={onMessage} onSaved={() => setOrderRevision((current) => current + 1)} />
    : null

  if (isConfigurationSection(section)) {
    return <ConfigurationSectionPage section={section} onMessage={onMessage} />
  }

  if (isOperationsToolsSection(section)) {
    return <OperationsToolsSectionPage section={section} onMessage={onMessage} />
  }

  if (isSystemSettingsSection(section)) {
    return <SystemSettingsSectionPage section={section} onMessage={onMessage} />
  }

  return (
    <SystemToolbarExtraContext.Provider value={manualOrderAction}>
      <div key={`${section}-${orderRevision}`}>
        {section === 'processTemplates' && <ProcessTemplateManager onMessage={onMessage} />}
        {section === 'process' && <ProcessManager onMessage={onMessage} />}
      </div>
    </SystemToolbarExtraContext.Provider>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={appInputClassName} />
    </div>
  )
}

function ProcessTemplateManager({ onMessage }: { onMessage: (msg: string) => void }) {
  const [templates, setTemplates] = useState<ProcessTemplate[]>([])
  const [materials, setMaterials] = useState<Array<{ id: string; code: string; name: string }>>([])
  const [keyword, setKeyword] = useState('')
  const [conditions, setConditions] = useState<ResourceSearchCondition[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ProcessTemplate | null>(null)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.system.processTemplates.viewMode', 'card')
  const isCompactViewport = useCompactViewport(1023)
  const effectiveViewMode = isCompactViewport ? 'card' : viewMode
  const emptyForm = () => ({ code: '', name: '', category: 'SAWING', defaultTime: 0, workstation: '', description: '', materialIds: [] as string[], standardBatchQty: 1000, setupTimeMinutes: 0, cycleTimeSeconds: 0, peopleCount: 1, laborRatePerHour: 0, machineCount: 1, machineRatePerHour: 0, energyCostPerHour: 0, consumableCostPerBatch: 0, yieldRate: 100 })
  const [form, setForm] = useState(emptyForm())
  const filteredTemplates = useMemo(
    () => filterByResourceSearch(templates, keyword, processTemplateSearchProfile, processTemplateAdvancedFields, conditions),
    [conditions, keyword, templates],
  )
  const templateSort = useClientTableSort(filteredTemplates, {
    manual: (template) => template.sortOrder,
    name: (template) => `${template.code} ${template.name}`,
    category: (template) => processCategoryLabel[template.category] || template.category,
    workstation: (template) => template.workstation,
    materials: (template) => template.materials.length,
  }, 'manual', 'asc')

  const load = async () => {
    const [templateRes, materialRes] = await Promise.all([fetch('/api/process-templates'), fetch('/api/materials?pageSize=200&sortBy=code&sortDir=asc')])
    const [templateData, materialData] = await Promise.all([templateRes.json(), materialRes.json()])
    if (templateRes.ok) setTemplates(templateData.data || []); else onMessage(templateData.error || '获取加工工艺失败')
    if (materialRes.ok) setMaterials(materialData.data || [])
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm())
    setShowModal(true)
  }

  const openEdit = (template: ProcessTemplate) => {
    setEditing(template)
    setForm({ code: template.code, name: template.name, category: template.category, defaultTime: template.defaultTime || 0, workstation: template.workstation || '', description: template.description || '', materialIds: template.materials.map((item) => item.id), standardBatchQty: template.standardBatchQty, setupTimeMinutes: template.setupTimeMinutes, cycleTimeSeconds: template.cycleTimeSeconds, peopleCount: template.peopleCount, laborRatePerHour: template.laborRatePerHour, machineCount: template.machineCount, machineRatePerHour: template.machineRatePerHour, energyCostPerHour: template.energyCostPerHour, consumableCostPerBatch: template.consumableCostPerBatch, yieldRate: template.yieldRate * 100 })
    setShowModal(true)
  }

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) return onMessage('模板编码和工艺名称必填')
    const res = await fetch('/api/process-templates', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, id: editing?.id, defaultTime: Number(form.defaultTime || 0), yieldRate: form.yieldRate / 100 }) })
    const data = await res.json()
    if (!res.ok) return onMessage(data.error || '保存加工工艺失败')
    setShowModal(false)
    onMessage(editing ? '加工工艺已更新' : '加工工艺已新增')
    await load()
  }

  return (
    <SystemResourcePage
      resourceKey="process-templates"
      title="加工工艺"
      description="按类别维护可复用工艺，并关联到物料全景。"
      summary={`共 ${filteredTemplates.length} 项`}
      keyword={keyword}
      onKeywordChange={setKeyword}
      searchPlaceholder="输入工艺编码、名称、类别、工位或关联物料"
      advancedFields={processTemplateAdvancedFields}
      conditions={conditions}
      onConditionsChange={setConditions}
      conditionLabel="加工工艺组合条件"
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      onCreate={openAdd}
      resourceLabel="加工工艺"
    >
      {effectiveViewMode === 'card' ? <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2">
        {templateSort.sortedRows.map((template) => {
          const thousand = processCostPerThousand(template)
          return (
          <div key={template.id} className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{template.name}</div><div className="mt-1 text-xs text-gray-500">{processCategoryLabel[template.category] || template.category} · {template.code}{template.isPreset ? ' · 预置' : ''}</div></div><button onClick={() => openEdit(template)} className="rounded border border-blue-300 px-3 py-1 text-xs text-blue-600">编辑</button></div>
            <div className="mt-2 text-sm text-gray-600">{template.workstation || '未设工位'}{template.defaultTime ? ` · ${template.defaultTime} 分钟` : ''}</div>
            {template.description && <div className="mt-2 text-xs text-gray-500">{template.description}</div>}
            <div className="mt-2 text-xs text-gray-500">关联物料：{template.materials.length ? template.materials.map((item) => item.code).join('、') : '暂无'}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 rounded bg-blue-50 p-2 text-xs text-blue-800"><span>千件人工<br/><b>{thousand.laborHours.toFixed(2)} h</b></span><span>千件机时<br/><b>{thousand.machineHours.toFixed(2)} h</b></span><span>千件工艺成本<br/><b>¥{thousand.cost.toFixed(2)}</b></span></div>
          </div>
        )})}
      </div> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-gray-50 text-left text-sm text-gray-600"><tr>
              <SortableTableHeader column="name" activeColumn={templateSort.sortColumn} direction={templateSort.sortDirection} onSort={templateSort.toggleSort}>加工工艺</SortableTableHeader>
              <SortableTableHeader column="category" activeColumn={templateSort.sortColumn} direction={templateSort.sortDirection} onSort={templateSort.toggleSort}>类别</SortableTableHeader>
              <SortableTableHeader column="workstation" activeColumn={templateSort.sortColumn} direction={templateSort.sortDirection} onSort={templateSort.toggleSort}>工位</SortableTableHeader>
              <SortableTableHeader column="materials" activeColumn={templateSort.sortColumn} direction={templateSort.sortDirection} onSort={templateSort.toggleSort}>关联物料</SortableTableHeader>
              <th className="px-4 py-3 text-right">操作</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">{templateSort.sortedRows.map((template) => <tr key={template.id}>
              <td className="px-4 py-3"><div className="font-medium text-gray-900">{template.name}</div><div className="font-mono text-xs text-gray-500">{template.code}{template.isPreset ? ' · 预置' : ''}</div></td>
              <td className="px-4 py-3 text-sm text-gray-600">{processCategoryLabel[template.category] || template.category}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{template.workstation || '-'}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{template.materials.length}</td>
              <td className="px-4 py-3 text-right"><AppButton size="sm" onClick={() => openEdit(template)}>编辑</AppButton></td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
      {filteredTemplates.length === 0 && <div className="py-12 text-center text-sm text-gray-500">暂无符合条件的加工工艺</div>}
      {showModal && <ModalDialog
        title={editing ? '编辑加工工艺' : '新建加工工艺'}
        description="维护可复用工艺参数，并可关联适用物料。"
        onClose={() => setShowModal(false)}
        size="lg"
        footer={<ModalActions onCancel={() => setShowModal(false)} onConfirm={submit} confirmLabel="保存" />}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="模板编码 *" value={form.code} onChange={(value) => setForm({ ...form, code: value })} />
          <Field label="工艺名称 *" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <label className="text-sm">类别<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2">{processCategoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-sm">默认工时（分钟）<input type="number" min="0" value={form.defaultTime || ''} onChange={(event) => setForm({ ...form, defaultTime: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" /></label>
          <Field label="默认工位" value={form.workstation} onChange={(value) => setForm({ ...form, workstation: value })} />
          <Field label="说明" value={form.description} onChange={(value) => setForm({ ...form, description: value })} />
        </div>
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4"><div className="mb-3 font-medium text-blue-900">千件工时、机时与成本参数</div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {([
            ['standardBatchQty', '标准批量', '件'], ['setupTimeMinutes', '每批准备时间', '分钟'], ['cycleTimeSeconds', '单件节拍', '秒/件'],
            ['peopleCount', '操作人数', '人'], ['laborRatePerHour', '人工小时费率', '元/h'], ['machineCount', '设备数量', '台'],
            ['machineRatePerHour', '设备机时费率', '元/h'], ['energyCostPerHour', '每小时能源费', '元/h'], ['consumableCostPerBatch', '每批耗材费', '元/批'], ['yieldRate', '标准合格率', '%'],
          ] as const).map(([key, label, unit]) => <label key={key} className="text-xs text-gray-600">{label}<div className="mt-1 flex overflow-hidden rounded border border-gray-200 bg-white"><input type="number" min="0" step="any" value={form[key] || ''} onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) })} className="min-w-0 flex-1 px-2 py-2 text-sm outline-none"/><span className="border-l bg-gray-50 px-2 py-2">{unit}</span></div></label>)}
        </div></div>
        <div className="mt-4"><div className="mb-2 text-sm font-medium">关联物料（可多选）</div><div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-3">{materials.map((material) => <label key={material.id} className="flex gap-2 text-sm"><input type="checkbox" checked={form.materialIds.includes(material.id)} onChange={(event) => setForm({ ...form, materialIds: event.target.checked ? [...form.materialIds, material.id] : form.materialIds.filter((id) => id !== material.id) })} />{material.code} · {material.name}</label>)}</div></div>
      </ModalDialog>}
    </SystemResourcePage>
  )
}

function ProcessManager({ onMessage }: { onMessage: (msg: string) => void }) {
  const emptyStep = (): ProcessStepForm => ({ stepNo: 1, name: '', defaultTime: 0, workstation: '', description: '', templateId: '', templateCode: '', standardBatchQty: 1000, setupTimeMinutes: 0, cycleTimeSeconds: 0, peopleCount: 1, laborRatePerHour: 0, machineCount: 1, machineRatePerHour: 0, energyCostPerHour: 0, consumableCostPerBatch: 0, yieldRate: 1 })
  const [routes, setRoutes] = useState<ProcessRoute[]>([])
  const [products, setProducts] = useState<MaterialChoice[]>([])
  const [templates, setTemplates] = useState<ProcessTemplate[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingRoute, setEditingRoute] = useState<ProcessRoute | null>(null)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [conditions, setConditions] = useState<ResourceSearchCondition[]>([])
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.system.process.viewMode', 'list')
  const isCompactViewport = useCompactViewport(1023)
  const effectiveViewMode = isCompactViewport ? 'card' : viewMode
  const [form, setForm] = useState({
    productId: '',
    name: '',
    isDefault: true,
    steps: [emptyStep()],
  })
  const displayMaterialCode = (sku?: string | null) => sku?.startsWith('MAT-') ? sku.slice(4) : sku || ''
  const filteredRoutes = useMemo(
    () => filterByResourceSearch(routes, keyword, processRouteSearchProfile, processRouteAdvancedFields, conditions),
    [conditions, keyword, routes],
  )
  const routeSort = useClientTableSort(filteredRoutes, {
    manual: (route) => route.sortOrder,
    material: (route) => `${displayMaterialCode(route.product?.sku)} ${route.product?.name || ''}`,
    name: (route) => route.name,
    default: (route) => route.isDefault,
    steps: (route) => route.steps.length,
  }, 'manual', 'asc')

  useEffect(() => {
    fetchProducts()
    fetchRoutes()
    fetchTemplates()
  }, [])

  const fetchProducts = async () => {
    const res = await fetch('/api/products')
    const data = await res.json()
    if (res.ok) {
      setProducts(data.data || [])
    } else {
      onMessage(data.error || '获取物料失败')
    }
  }

  const fetchRoutes = async () => {
    const res = await fetch('/api/process-routes')
    const data = await res.json()
    if (res.ok) {
      setRoutes(data.data || [])
    } else {
      onMessage(data.error || '获取工艺路线失败')
    }
  }

  const fetchTemplates = async () => {
    const res = await fetch('/api/process-templates')
    const data = await res.json()
    if (res.ok) setTemplates(data.data || [])
  }

  const resetForm = () => {
    setEditingRoute(null)
    setForm({ productId: '', name: '', isDefault: true, steps: [emptyStep()] })
  }

  const openAdd = () => {
    resetForm()
    setShowModal(true)
  }

  const openEdit = (route: ProcessRoute) => {
    const materialOption = products.find((product) => product.sku === route.product?.sku || `MAT-${product.sku}` === route.product?.sku)
    setEditingRoute(route)
    setForm({
      productId: materialOption?.id || route.productId,
      name: route.name,
      isDefault: route.isDefault,
      steps: route.steps.length > 0
        ? route.steps.map((step) => ({
            stepNo: step.stepNo,
            name: step.name,
            defaultTime: step.defaultTime || 0,
            workstation: step.workstation || '',
            description: step.description || '',
            templateId: step.templateId || '', templateCode: step.templateCode || '', standardBatchQty: step.standardBatchQty, setupTimeMinutes: step.setupTimeMinutes,
            cycleTimeSeconds: step.cycleTimeSeconds, peopleCount: step.peopleCount, laborRatePerHour: step.laborRatePerHour, machineCount: step.machineCount,
            machineRatePerHour: step.machineRatePerHour, energyCostPerHour: step.energyCostPerHour, consumableCostPerBatch: step.consumableCostPerBatch, yieldRate: step.yieldRate,
          }))
        : [emptyStep()],
    })
    setShowModal(true)
  }

  const updateStep = (index: number, patch: Partial<ProcessStepForm>) => {
    setForm({
      ...form,
      steps: form.steps.map((step, currentIndex) => currentIndex === index ? { ...step, ...patch } : step),
    })
  }

  const applyTemplate = (index: number, templateId: string) => {
    const template = templates.find((item) => item.id === templateId)
    if (!template) return updateStep(index, { templateId: '', templateCode: '' })
    updateStep(index, {
      templateId: template.id, templateCode: template.code, name: template.name, workstation: template.workstation || '', description: template.description || '',
      defaultTime: template.defaultTime || 0, standardBatchQty: template.standardBatchQty, setupTimeMinutes: template.setupTimeMinutes, cycleTimeSeconds: template.cycleTimeSeconds,
      peopleCount: template.peopleCount, laborRatePerHour: template.laborRatePerHour, machineCount: template.machineCount, machineRatePerHour: template.machineRatePerHour,
      energyCostPerHour: template.energyCostPerHour, consumableCostPerBatch: template.consumableCostPerBatch, yieldRate: template.yieldRate,
    })
  }

  const addStep = () => {
    const nextNo = form.steps.length > 0 ? Math.max(...form.steps.map((step) => step.stepNo)) + 1 : 1
    setForm({ ...form, steps: [...form.steps, { ...emptyStep(), stepNo: nextNo }] })
  }

  const removeStep = (index: number) => {
    if (form.steps.length <= 1) {
      onMessage('至少需要一个工序')
      return
    }
    setForm({ ...form, steps: form.steps.filter((_, currentIndex) => currentIndex !== index) })
  }

  const submit = async () => {
    if (!form.productId || !form.name || form.steps.some((step) => !step.name || step.stepNo <= 0)) {
      onMessage('物料、路线名称、工序号和工序名称必填')
      return
    }

    setLoading(true)
    const res = await fetch('/api/process-routes', {
      method: editingRoute ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingRoute?.id,
        productId: form.productId,
        name: form.name,
        isDefault: form.isDefault,
        steps: form.steps.map((step) => ({
          stepNo: Number(step.stepNo),
          name: step.name,
          defaultTime: Number(step.defaultTime || 0),
          workstation: step.workstation || undefined,
          description: step.description || undefined,
          templateId: step.templateId || undefined, templateCode: step.templateCode || undefined, standardBatchQty: step.standardBatchQty, setupTimeMinutes: step.setupTimeMinutes,
          cycleTimeSeconds: step.cycleTimeSeconds, peopleCount: step.peopleCount, laborRatePerHour: step.laborRatePerHour, machineCount: step.machineCount,
          machineRatePerHour: step.machineRatePerHour, energyCostPerHour: step.energyCostPerHour, consumableCostPerBatch: step.consumableCostPerBatch, yieldRate: step.yieldRate,
        })),
      }),
    })
    const data = await res.json()
    if (res.ok) {
      onMessage(editingRoute ? '工艺路线已更新' : '工艺路线已创建')
      setShowModal(false)
      resetForm()
      await fetchRoutes()
    } else {
      onMessage(data.error || '保存工艺路线失败')
    }
    setLoading(false)
  }

  return (
    <SystemResourcePage
      resourceKey="process-routes"
      title="BOM／工艺路线"
      description="维护物料工艺路线和工序。已产生派工或报工的工序不建议直接修改。"
      summary={`共 ${filteredRoutes.length} 项`}
      keyword={keyword}
      onKeywordChange={setKeyword}
      searchPlaceholder="输入物料编码、名称、路线或工序；空格分隔多个关键词"
      advancedFields={processRouteAdvancedFields}
      conditions={conditions}
      onConditionsChange={setConditions}
      conditionLabel="工艺路线组合条件"
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      onCreate={openAdd}
      resourceLabel="工艺路线"
    >
      {effectiveViewMode === 'card' && filteredRoutes.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-2">
          {routeSort.sortedRows.map((route) => (
            <div key={route.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-900">{route.name}</div>
                  <div className="mt-1 text-sm text-gray-500">{route.product?.name} ({displayMaterialCode(route.product?.sku)})</div>
                </div>
                <div className="flex items-center gap-2">
                  {route.isDefault && <span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">默认</span>}
                  <button onClick={() => openEdit(route)} className="px-3 py-1 text-blue-600 border border-blue-300 rounded text-xs hover:bg-blue-50">
                    编辑
                  </button>
                </div>
              </div>
              {(() => { const totals = route.steps.reduce((sum, step) => { const value = routeStepCostPerThousand(step); return { labor: sum.labor + value.laborHours, machine: sum.machine + value.machineHours, cost: sum.cost + value.cost } }, { labor: 0, machine: 0, cost: 0 }); return <div className="mt-3 grid grid-cols-3 gap-2 rounded bg-blue-50 p-2 text-xs text-blue-800"><span>千件人工<br/><b>{totals.labor.toFixed(2)} h</b></span><span>千件机时<br/><b>{totals.machine.toFixed(2)} h</b></span><span>千件路线成本<br/><b>¥{totals.cost.toFixed(2)}</b></span></div> })()}
              <div className="mt-4 space-y-2">
                {route.steps.map((step) => (
                  <div key={step.id} className="rounded bg-gray-50 p-3 text-sm">
                    <div className="font-medium text-gray-900">{step.stepNo}. {step.name}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {step.workstation ? `工位：${step.workstation}` : '未设工位'}
                      {step.defaultTime ? ` · ${step.defaultTime} 分钟` : ''}
                    </div>
                    {step.description && <div className="mt-1 text-xs text-gray-500">{step.description}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <SortableTableHeader column="material" activeColumn={routeSort.sortColumn} direction={routeSort.sortDirection} onSort={routeSort.toggleSort}>物料</SortableTableHeader>
              <SortableTableHeader column="name" activeColumn={routeSort.sortColumn} direction={routeSort.sortDirection} onSort={routeSort.toggleSort}>路线名称</SortableTableHeader>
              <SortableTableHeader column="default" activeColumn={routeSort.sortColumn} direction={routeSort.sortDirection} onSort={routeSort.toggleSort}>默认</SortableTableHeader>
              <SortableTableHeader column="steps" activeColumn={routeSort.sortColumn} direction={routeSort.sortDirection} onSort={routeSort.toggleSort}>工序</SortableTableHeader>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {routeSort.sortedRows.map((route) => (
              <tr key={route.id} className="hover:bg-gray-50 align-top">
                <td className="px-4 py-3">
                  <div className="font-medium text-sm">{route.product?.name}</div>
                  <div className="text-xs text-gray-500">{displayMaterialCode(route.product?.sku)}</div>
                </td>
                <td className="px-4 py-3 text-sm">{route.name}</td>
                <td className="px-4 py-3 text-sm">{route.isDefault ? '是' : '-'}</td>
                <td className="px-4 py-3 text-sm">
                  <div className="space-y-1">
                    {route.steps.map((step) => (
                      <div key={step.id}>
                        {step.stepNo}. {step.name}
                        {step.workstation ? <span className="text-gray-500"> / {step.workstation}</span> : null}
                        {step.defaultTime ? <span className="text-gray-500"> / {step.defaultTime} 分钟</span> : null}
                      </div>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(route)} className="px-3 py-1 text-blue-600 border border-blue-300 rounded text-xs hover:bg-blue-50">
                    编辑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {filteredRoutes.length === 0 && <div className="text-center py-12 text-gray-500">暂无符合条件的工艺路线</div>}

      {showModal && (
        <ModalDialog
          title={editingRoute ? '编辑工艺路线' : '新建工艺路线'}
          description="维护物料默认路线及其有序工序。"
          onClose={() => { setShowModal(false); resetForm() }}
          closeDisabled={loading}
          size="xl"
          footer={(
            <ModalActions
              onCancel={() => { setShowModal(false); resetForm() }}
              onConfirm={submit}
              confirmLabel="保存"
              busy={loading}
            />
          )}
        >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">物料 *</label>
                  <MaterialChoiceSearch
                    value={form.productId}
                    options={products}
                    onChange={(productId) => setForm({ ...form, productId })}
                    placeholder="输入物料编码或名称筛选"
                  />
                </div>
                <Field label="路线名称 *" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                  className="h-4 w-4"
                />
                设为该物料默认工艺路线
              </label>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">工序列表</h4>
                  <button onClick={addStep} className="px-3 py-1 text-sm text-green-700 border border-green-300 rounded hover:bg-green-50">
                    添加工序
                  </button>
                </div>
                <div className="space-y-3">
                  {form.steps.map((step, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-3">
                      <div className="mb-3">
                        <label className="block text-xs text-gray-500 mb-1">从可计算工艺模板加入</label>
                        <SearchableSelect
                          value={step.templateId}
                          onChange={(templateId) => applyTemplate(index, templateId)}
                          options={[
                            { value: '', label: '手工工序' },
                            ...templates.map((template) => ({ value: template.id, label: `${template.code} · ${template.name}` })),
                          ]}
                          placeholder="输入模板编码或名称筛选"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">工序号 *</label>
                          <input
                            type="number"
                            value={step.stepNo || ''}
                            onChange={(e) => updateStep(index, { stepNo: Number(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-200 rounded"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">工序名称 *</label>
                          <input
                            value={step.name}
                            onChange={(e) => updateStep(index, { name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">工位</label>
                          <input
                            value={step.workstation}
                            onChange={(e) => updateStep(index, { workstation: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">默认工时(分钟)</label>
                          <input
                            type="number"
                            value={step.defaultTime || ''}
                            onChange={(e) => updateStep(index, { defaultTime: Number(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-200 rounded"
                          />
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="block text-xs text-gray-500 mb-1">说明</label>
                        <input
                          value={step.description}
                          onChange={(e) => updateStep(index, { description: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded"
                        />
                      </div>
                      {step.templateId && (() => { const value = routeStepCostPerThousand(step); return <div className="mt-3 grid grid-cols-3 gap-2 rounded bg-gray-50 p-2 text-xs text-gray-600"><span>千件人工 <b>{value.laborHours.toFixed(2)}h</b></span><span>千件机时 <b>{value.machineHours.toFixed(2)}h</b></span><span>千件成本 <b>¥{value.cost.toFixed(2)}</b></span></div> })()}
                      <div className="mt-3 flex justify-end">
                        <button onClick={() => removeStep(index)} className="px-3 py-1 text-xs text-red-600 border border-red-300 rounded hover:bg-red-50">
                          移除本工序
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
        </ModalDialog>
      )}
    </SystemResourcePage>
  )
}
