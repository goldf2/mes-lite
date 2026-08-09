'use client'

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Columns2, Eye, EyeOff, LayoutPanelLeft, MousePointer2, PanelRightOpen, Pin, PlugZap, Rows3, Save, SlidersHorizontal } from 'lucide-react'
import ViewModeToggle, { usePersistedViewMode } from './ViewModeToggle'
import { useDesktopNavigationPreference, useModalGlassPreference, useSiblingNavigationPreference, useWorkspaceLayoutPreference } from './interfacePreferences'
import MaterialChoiceSearch from './MaterialChoiceSearch'
import { SearchFieldWithPresets } from './SavedSearchPresets'
import useCompactViewport from './useCompactViewport'
import DataIntegrityPanel from './DataIntegrityPanel'
import SearchableSelect from './SearchableSelect'
import SortableTableHeader from './SortableTableHeader'
import useClientTableSort from './useClientTableSort'
import AppButton from './AppButton'
import ModalDialog, { ModalActions } from './ModalDialog'
import { appInputClassName, appTextareaClassName } from './FormField'
import ConfigurationManualOrder from './ConfigurationManualOrder'
import AppLoadingIndicator from './AppLoadingIndicator'
import { useAiAssistantAppearance } from './AiAssistantAppearanceProvider'
import ContrastModeSelector from './ContrastModeSelector'
import { applyContrastMode, ContrastMode, normalizeContrastMode } from '@/lib/contrast-modes'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import TopBarPortal from './TopBarPortal'
import ImageOptimizationPanel from './ImageOptimizationPanel'
import WorkspaceNavigationSettings from './navigation/WorkspaceNavigationSettings'
import { ResourceAdvancedSearch, ResourcePageShell } from './resource'
import {
  filterByResourceSearch,
  type ResourceAdvancedSearchField,
  type ResourceSearchCondition,
  type ResourceSearchProfile,
} from '@/lib/resource-search'
import ConfigurationSectionPage, { isReferenceConfigurationSection } from '@/modules/configuration'
import type { RegisteredSystemSection } from '@/lib/page-registry'

interface AuditLog {
  id: string
  operatorName?: string | null
  action: string
  entityType: string
  entityId?: string | null
  entityLabel?: string | null
  note?: string | null
  createdAt: string
}

interface DeletedRecord {
  id: string
  label: string
  type: string
  model: 'material' | 'supplier' | 'customer' | 'materialIn' | 'workInstruction' | 'order' | 'dispatch' | 'shipment' | 'return'
  deletedAt?: string | null
}

interface AiAgentConfigView {
  enabled: boolean
  configured: boolean
  providerName: string
  baseUrl: string
  model: string
  timeoutMs: number
  maxToolRounds: number
  source: 'PAGE' | 'ENV'
  apiKeySource: 'PAGE' | 'ENV' | 'NONE'
  apiKeyConfigured: boolean
  storedApiKeyConfigured: boolean
  apiKeyHint: string | null
  storageReady: boolean
  apiKeyError: 'MISSING_SECRET' | 'DECRYPT_FAILED' | null
}

const aiProviderPresets = [
  { key: 'qwen', label: '通义千问', providerName: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { key: 'deepseek', label: 'DeepSeek', providerName: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { key: 'glm', label: '智谱 GLM', providerName: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
] as const

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

interface MaterialCodeNormalizationPreview {
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

function SystemPageToolbar({
  searchStorageKey,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  viewMode,
  onViewModeChange,
  actions,
}: {
  searchStorageKey?: string
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  viewMode?: 'card' | 'list'
  onViewModeChange?: (value: 'card' | 'list') => void
  actions?: ReactNode
}) {
  const extraAction = useContext(SystemToolbarExtraContext)
  const primaryFilters = searchStorageKey && searchValue !== undefined && onSearchChange && searchPlaceholder
    ? <SearchFieldWithPresets storageKey={searchStorageKey} value={searchValue} onChange={onSearchChange} placeholder={searchPlaceholder} />
    : undefined
  const toolbarActions = extraAction || actions
    ? (
        <>
          {extraAction}
          {actions}
        </>
      )
    : undefined

  return <TopBarPortal><ResponsiveToolbarActions primaryFilters={primaryFilters} viewControl={viewMode && onViewModeChange ? <ViewModeToggle value={viewMode} onChange={onViewModeChange} /> : undefined} actions={toolbarActions} /></TopBarPortal>
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

  if (isReferenceConfigurationSection(section)) {
    return <ConfigurationSectionPage section={section} onMessage={onMessage} />
  }

  return (
    <SystemToolbarExtraContext.Provider value={manualOrderAction}>
      <div key={`${section}-${orderRevision}`}>
        {section === 'processTemplates' && <ProcessTemplateManager onMessage={onMessage} />}
        {section === 'process' && <ProcessManager onMessage={onMessage} />}
        {section === 'recycle' && <RecycleBin onMessage={onMessage} />}
        {section === 'audit' && <AuditLogViewer onMessage={onMessage} />}
        {section === 'dataTools' && <DataToolManager onMessage={onMessage} />}
        {(section === 'businessSettings' || section === 'displaySettings' || section === 'navigationSettings' || section === 'aiSettings') && (
          <SettingsManager section={section} onMessage={onMessage} />
        )}
      </div>
    </SystemToolbarExtraContext.Provider>
  )
}

function DataToolManager({ onMessage }: { onMessage: (msg: string) => void }) {
  const [preview, setPreview] = useState<MaterialCodeNormalizationPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState(false)

  const loadPreview = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/system/material-code-normalization')
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '检查物料编码失败')
        return
      }
      setPreview(data.data)
    } finally {
      setLoading(false)
    }
  }, [onMessage])

  useEffect(() => {
    loadPreview()
  }, [loadPreview])

  const execute = async () => {
    if (!preview || !preview.canExecute || preview.pendingMaterialCount === 0) return
    if (!confirm(`将删除 ${preview.pendingMaterialCount} 条物料编码中的全部空白字符并转换为大写。该操作会同步关联产品编码，是否继续？`)) return

    setExecuting(true)
    try {
      const res = await fetch('/api/system/material-code-normalization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'NORMALIZE_MATERIAL_CODES' }),
      })
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '物料编码转换失败')
        if (data.data) setPreview(data.data)
        return
      }
      onMessage(`已转换 ${data.data.changedMaterials} 条物料编码，同步 ${data.data.changedProducts} 条关联产品编码`)
      await loadPreview()
    } finally {
      setExecuting(false)
    }
  }

  const blockerCount = preview
    ? preview.invalidMaterials.length + preview.materialConflicts.length + preview.productConflicts.length + preview.ambiguousProducts.length
    : 0

  return (
    <div className="rounded-lg bg-white p-4 shadow sm:p-6">
      <div className="mb-5">
        <h3 className="text-lg font-semibold">数据工具</h3>
        <p className="mt-1 text-sm text-gray-500">执行前先预检，修改与删除操作使用数据库事务并写入操作记录。</p>
      </div>

      <div className="mb-4">
        <ImageOptimizationPanel onMessage={onMessage} />
      </div>

      <DataIntegrityPanel onMessage={onMessage} />

      <div className="mt-4 rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="font-medium text-gray-900">规范化物料编码</div>
            <div className="mt-1 text-sm text-gray-500">删除编码中的全部空格、制表符和换行，再将英文字母转换为大写。</div>
            <div className="mt-2 text-xs text-gray-500">物料关联的兼容产品编码会同步更新；名称、规格、历史单据快照不变。</div>
          </div>
          <button
            onClick={execute}
            disabled={loading || executing || !preview?.canExecute || preview.pendingMaterialCount === 0}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {executing ? '转换中...' : '转换为大写并删除空格'}
          </button>
        </div>

        {loading ? (
          <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">正在检查物料编码...</div>
        ) : preview ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">物料总数</div><div className="mt-1 text-xl font-semibold">{preview.totalMaterials}</div></div>
              <div className="rounded-lg bg-blue-50 p-3"><div className="text-xs text-blue-600">待转换物料</div><div className="mt-1 text-xl font-semibold text-blue-800">{preview.pendingMaterialCount}</div></div>
              <div className="rounded-lg bg-cyan-50 p-3"><div className="text-xs text-cyan-600">关联产品同步</div><div className="mt-1 text-xl font-semibold text-cyan-800">{preview.pendingProductCount}</div></div>
              <div className={`rounded-lg p-3 ${blockerCount > 0 ? 'bg-red-50' : 'bg-green-50'}`}><div className={`text-xs ${blockerCount > 0 ? 'text-red-600' : 'text-green-600'}`}>阻塞问题</div><div className={`mt-1 text-xl font-semibold ${blockerCount > 0 ? 'text-red-800' : 'text-green-800'}`}>{blockerCount}</div></div>
            </div>

            {blockerCount > 0 && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <div className="font-medium">存在冲突，当前禁止转换</div>
                {preview.invalidMaterials.map((item) => <div key={item.id} className="mt-2">空白编码：{item.name}（{JSON.stringify(item.code)}）</div>)}
                {preview.materialConflicts.map((item) => (
                  <div key={item.normalizedCode} className="mt-2">
                    转换后重复为 {item.normalizedCode}：{item.materials.map((material) => `${material.code} · ${material.name}`).join('；')}
                  </div>
                ))}
                {preview.productConflicts.map((item) => <div key={item.normalizedSku} className="mt-2">关联产品编码冲突：{item.normalizedSku}</div>)}
                {preview.ambiguousProducts.map((item) => <div key={item.productId} className="mt-2">关联产品 {item.sku} 同时匹配物料：{item.materialCodes.join('、')}</div>)}
              </div>
            )}

            {blockerCount === 0 && preview.pendingMaterialCount === 0 && (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">当前全部物料编码已经符合规范，无需转换。</div>
            )}

            {preview.pendingMaterialCount > 0 && (
              <div className="mt-4">
                <div className="mb-2 text-sm font-medium text-gray-700">转换预览（最多显示 20 条）</div>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-gray-600"><tr><th className="px-3 py-2">物料</th><th className="px-3 py-2">转换前</th><th className="px-3 py-2">转换后</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {preview.changes.slice(0, 20).map((change) => (
                        <tr key={change.id}><td className="px-3 py-2">{change.name}{change.archived ? '（已归档）' : ''}</td><td className="px-3 py-2 font-mono text-gray-600">{change.before}</td><td className="px-3 py-2 font-mono font-medium text-blue-700">{change.after}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}

function SettingsManager({
  section,
  onMessage,
}: {
  section: 'businessSettings' | 'displaySettings' | 'navigationSettings' | 'aiSettings'
  onMessage: (msg: string) => void
}) {
  const [modalGlassEnabled, setModalGlassEnabled] = useModalGlassPreference()
  const [navigationPreference, setNavigationPreference] = useDesktopNavigationPreference()
  const [workspaceLayoutPreference, setWorkspaceLayoutPreference] = useWorkspaceLayoutPreference()
  const [siblingNavigationEnabled, setSiblingNavigationEnabled] = useSiblingNavigationPreference()
  const { loadingIndicatorEnabled, setLoadingIndicatorEnabled } = useAiAssistantAppearance()
  const [contrastMode, setContrastMode] = useState<ContrastMode>('standard')
  const [naturalCodeSortEnabled, setNaturalCodeSortEnabled] = useState(false)
  const [companyProfile, setCompanyProfile] = useState({ companyName: '', companyContact: '', companyPhone: '', companyAddress: '' })
  const [settingLoading, setSettingLoading] = useState(true)
  const [settingSaving, setSettingSaving] = useState(false)

  const loadSettings = useCallback(async () => {
    setSettingLoading(true)
    try {
      const res = await fetch('/api/system/settings')
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '获取系统设置失败')
        return
      }
      setNaturalCodeSortEnabled(Boolean(data.data?.naturalMaterialCodeSortEnabled))
      const nextContrastMode = normalizeContrastMode(data.data?.contrastMode)
      setContrastMode(nextContrastMode)
      applyContrastMode(nextContrastMode)
      setCompanyProfile({
        companyName: data.data?.companyName || '',
        companyContact: data.data?.companyContact || '',
        companyPhone: data.data?.companyPhone || '',
        companyAddress: data.data?.companyAddress || '',
      })
      setLoadingIndicatorEnabled(data.data?.aiLoadingIndicatorEnabled !== false)
    } finally {
      setSettingLoading(false)
    }
  }, [onMessage, setLoadingIndicatorEnabled])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const saveNaturalCodeSort = async (enabled: boolean) => {
    setSettingSaving(true)
    try {
      const res = await fetch('/api/system/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naturalMaterialCodeSortEnabled: enabled }),
      })
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '保存系统设置失败')
        return
      }
      setNaturalCodeSortEnabled(Boolean(data.data?.naturalMaterialCodeSortEnabled))
      onMessage(`物料编码数字自然排序已${enabled ? '开启' : '关闭'}`)
    } finally {
      setSettingSaving(false)
    }
  }

  const saveContrastMode = async (nextMode: ContrastMode) => {
    const previousMode = contrastMode
    setContrastMode(nextMode)
    applyContrastMode(nextMode)
    setSettingSaving(true)
    try {
      const res = await fetch('/api/system/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contrastMode: nextMode }),
      })
      const data = await res.json()
      if (!res.ok) {
        setContrastMode(previousMode)
        applyContrastMode(previousMode)
        onMessage(data.error || '保存页面对比度失败')
        return
      }
      const savedMode = normalizeContrastMode(data.data?.contrastMode)
      setContrastMode(savedMode)
      applyContrastMode(savedMode)
      onMessage('页面对比度已更新')
    } finally {
      setSettingSaving(false)
    }
  }

  const saveLoadingIndicator = async (enabled: boolean) => {
    setSettingSaving(true)
    try {
      const res = await fetch('/api/system/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiLoadingIndicatorEnabled: enabled }),
      })
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '保存页面加载图标设置失败')
        return
      }
      setLoadingIndicatorEnabled(Boolean(data.data?.aiLoadingIndicatorEnabled))
      onMessage(`页面加载图标已${enabled ? '开启' : '关闭'}`)
    } finally {
      setSettingSaving(false)
    }
  }

  const saveCompanyProfile = async () => {
    if (!companyProfile.companyName.trim()) return onMessage('请填写乙方企业名称')
    setSettingSaving(true)
    try {
      const res = await fetch('/api/system/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(companyProfile),
      })
      const data = await res.json()
      if (!res.ok) return onMessage(data.error || '保存企业资料失败')
      setCompanyProfile({
        companyName: data.data?.companyName || '',
        companyContact: data.data?.companyContact || '',
        companyPhone: data.data?.companyPhone || '',
        companyAddress: data.data?.companyAddress || '',
      })
      onMessage('发货单乙方资料已保存')
    } finally {
      setSettingSaving(false)
    }
  }

  const pageCopy = {
    businessSettings: {
      title: '企业与业务规则',
      description: '维护企业资料以及会影响业务数据、列表和导出的全局规则。',
    },
    displaySettings: {
      title: '显示设置',
      description: '维护导航、配色与弹窗等全局界面偏好。',
    },
    navigationSettings: {
      title: '导航与工作区',
      description: '配置 MES、MRP、ERP 菜单范围、页面显示名称与默认顺序。',
    },
    aiSettings: {
      title: 'AI 服务',
      description: '维护 AI 助手服务、模型连接、密钥和系统级助手外观。',
    },
  }[section]

  return (
    <SystemResourcePage
      resourceKey={section}
      title={pageCopy.title}
      description={pageCopy.description}
      contentClassName="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5"
    >
      {section === 'displaySettings' && (
        <>
          <div className="mb-4 rounded-lg border border-gray-200 p-4">
            <div className="font-medium text-gray-900">工作区布局</div>
            <div className="mt-1 text-sm text-gray-500">切换整个应用的导航、工具与主内容区域排布；业务页面和数据不会改变。</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {([
                { value: 'sidebar' as const, label: '标准管理', description: '左侧导航与顶部页面工具，适合日常维护和列表操作', icon: LayoutPanelLeft },
                { value: 'canvas' as const, label: '画布工作', description: '顶部导航与右侧页面工具，保留更连贯的主显示区域', icon: PanelRightOpen },
              ]).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setWorkspaceLayoutPreference({ layout: option.value })}
                  className={`rounded-lg border p-3 text-left transition ${workspaceLayoutPreference.layout === option.value ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-gray-900"><option.icon className="h-4 w-4" />{option.label}</span>
                  <span className="mt-1 block text-xs text-gray-500">{option.description}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 text-xs text-gray-500">个人工作区偏好，只保存在当前浏览器；也可通过全局布局按钮快速切换。</div>
          </div>

          {workspaceLayoutPreference.layout === 'sidebar' && (
            <div className="mb-4 rounded-lg border border-gray-200 p-4">
              <div className="font-medium text-gray-900">左侧导航行为</div>
              <div className="mt-1 text-sm text-gray-500">标准管理布局下，可让导航持续占位，或在需要时从左侧响应呼出。</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {([
                  { value: 'persistent' as const, label: '常驻显示', description: '导航固定显示，主内容始终保留侧栏空间', icon: Pin },
                  { value: 'auto-hide' as const, label: '自动隐藏', description: '收回后仅保留入口，鼠标靠近或点击时覆盖呼出', icon: MousePointer2 },
                ]).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setWorkspaceLayoutPreference({ navigationBehavior: option.value })}
                    className={`rounded-lg border p-3 text-left transition ${workspaceLayoutPreference.navigationBehavior === option.value ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-gray-900"><option.icon className="h-4 w-4" />{option.label}</span>
                    <span className="mt-1 block text-xs text-gray-500">{option.description}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 text-xs text-gray-500">导航面板内的固定按钮也可随时在两种行为之间切换。</div>
            </div>
          )}

          <div className="mb-4 rounded-lg border border-gray-200 p-4">
            <div className="font-medium text-gray-900">桌面导航布局</div>
            <div className="mt-1 text-sm text-gray-500">仅影响标准管理模式的左侧导航：宽屏可选择单列折叠或固定双列；窄桌面仍自动使用单列。</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {([
                { value: 'accordion' as const, label: '单列折叠', description: '占用空间更少', icon: Rows3 },
                { value: 'split' as const, label: '双列导航', description: '切换一级、二级功能更快', icon: Columns2 },
              ]).map((option) => <button key={option.value} type="button" onClick={() => setNavigationPreference({ mode: option.value })} className={`rounded-lg border p-3 text-left transition ${navigationPreference.mode === option.value ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:bg-gray-50'}`}><span className="flex items-center gap-2 text-sm font-semibold text-gray-900"><option.icon className="h-4 w-4" />{option.label}</span><span className="mt-1 block text-xs text-gray-500">{option.description}</span></button>)}
            </div>
          </div>

          <div className="mb-4 rounded-lg border border-gray-200 p-4">
            <div className="font-medium text-gray-900">一级菜单显示</div>
            <div className="mt-1 text-sm text-gray-500">一级菜单保持单行排列，可按识别习惯选择图标与文字组合。</div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {([
                { value: 'icon' as const, label: '图标' },
                { value: 'icon-label' as const, label: '图标＋文字' },
                { value: 'label' as const, label: '文字' },
              ]).map((option) => <button key={option.value} type="button" onClick={() => setNavigationPreference({ displayMode: option.value })} className={`rounded-lg border px-2 py-3 text-center transition ${navigationPreference.displayMode === option.value ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:bg-gray-50'}`}><span className="flex min-h-6 items-center justify-center gap-1.5 text-xs font-semibold text-gray-900">{option.value !== 'label' && <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-700">仪</span>}{option.value !== 'icon' && <span>{option.value === 'label' ? '工作台' : '文字'}</span>}</span><span className="mt-1.5 block text-[11px] text-gray-500">{option.label}</span></button>)}
            </div>
            <div className="mt-2 text-xs text-gray-500">个人显示偏好，只保存在当前浏览器。</div>
          </div>

          <div className="mb-4 rounded-lg border border-gray-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-medium text-gray-900">显示同级菜单按钮</div>
                <div className="mt-1 text-sm text-gray-500">在窄屏固定顶部工具条显示同级菜单呼出按钮；菜单默认收起，点击后可在物料、生产、销售和配置的同组页面间切换。</div>
                <div className="mt-2 text-xs text-gray-500">个人显示偏好，只保存在当前浏览器；菜单名称、顺序和权限仍来自统一菜单配置。</div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-3">
                <span className="text-sm text-gray-600">{siblingNavigationEnabled ? '已开启' : '已关闭'}</span>
                <input type="checkbox" checked={siblingNavigationEnabled} onChange={(event) => setSiblingNavigationEnabled(event.target.checked)} className="sr-only" />
                <span className={`relative h-7 w-12 rounded-full transition ${siblingNavigationEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${siblingNavigationEnabled ? 'left-6' : 'left-1'}`} />
                </span>
              </label>
            </div>
          </div>

          <div className="mb-4 rounded-lg border border-gray-200 p-4">
            <div className="mb-4">
              <div className="font-medium text-gray-900">页面对比度配色</div>
              <div className="mt-1 text-sm text-gray-500">统一调整页面背景、容器层级、边框清晰度、标题、正文和辅助文字的反差；按钮主色与业务状态色保持不变。</div>
              <div className="mt-2 text-xs text-gray-500">系统级设置，保存后对所有客户端生效；当前页面会立即预览。</div>
            </div>
            <ContrastModeSelector value={contrastMode} onChange={saveContrastMode} disabled={settingLoading || settingSaving} />
          </div>

          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-medium text-gray-900">弹窗背景磨砂玻璃</div>
                <div className="mt-1 text-sm text-gray-500">开启后弹窗出现时背景会模糊并遮罩；关闭后仅保留半透明遮罩，仍会屏蔽底层按钮响应。</div>
                <div className="mt-2 text-xs text-gray-500">个人显示偏好，只保存在当前浏览器。</div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-3">
                <span className="text-sm text-gray-600">{modalGlassEnabled ? '已开启' : '已关闭'}</span>
                <input type="checkbox" checked={modalGlassEnabled} onChange={(event) => setModalGlassEnabled(event.target.checked)} className="sr-only" />
                <span className={`relative h-7 w-12 rounded-full transition ${modalGlassEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${modalGlassEnabled ? 'left-6' : 'left-1'}`} />
                </span>
              </label>
            </div>
          </div>
        </>
      )}

      {section === 'businessSettings' && (
        <>
          <div className="mb-4 rounded-lg border border-gray-200 p-4">
            <div className="mb-4">
              <div className="font-medium text-gray-900">发货单乙方资料</div>
              <div className="mt-1 text-sm text-gray-500">作为供货方显示在发货单 PDF 中；甲方资料自动读取销售订单客户。</div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div><label className="mb-2 block text-sm font-medium text-gray-700">企业名称</label><input value={companyProfile.companyName} onChange={(event) => setCompanyProfile({ ...companyProfile, companyName: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2" /></div>
              <div><label className="mb-2 block text-sm font-medium text-gray-700">联系人</label><input value={companyProfile.companyContact} onChange={(event) => setCompanyProfile({ ...companyProfile, companyContact: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2" /></div>
              <div><label className="mb-2 block text-sm font-medium text-gray-700">联系电话</label><input value={companyProfile.companyPhone} onChange={(event) => setCompanyProfile({ ...companyProfile, companyPhone: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2" /></div>
              <div><label className="mb-2 block text-sm font-medium text-gray-700">企业地址</label><input value={companyProfile.companyAddress} onChange={(event) => setCompanyProfile({ ...companyProfile, companyAddress: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2" /></div>
            </div>
            <div className="mt-4 flex justify-end"><AppButton variant="primary" onClick={saveCompanyProfile} disabled={settingLoading || settingSaving}>{settingSaving ? '保存中...' : '保存乙方资料'}</AppButton></div>
          </div>

          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-medium text-gray-900">物料编码数字自然排序</div>
                <div className="mt-1 text-sm text-gray-500">开启后，物料列表和导出中的编码按数字片段排序，例如 2 排在 12 前、A2 排在 A10 前；不会修改编码内容。</div>
                <div className="mt-2 text-xs text-gray-500">业务配置，保存后对所有客户端生效。</div>
              </div>
              <label className={`inline-flex items-center gap-3 ${settingLoading || settingSaving ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}>
                <span className="text-sm text-gray-600">{settingLoading ? '读取中' : settingSaving ? '保存中' : naturalCodeSortEnabled ? '已开启' : '已关闭'}</span>
                <input type="checkbox" checked={naturalCodeSortEnabled} disabled={settingLoading || settingSaving} onChange={(event) => saveNaturalCodeSort(event.target.checked)} className="sr-only" />
                <span className={`relative h-7 w-12 rounded-full transition ${naturalCodeSortEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${naturalCodeSortEnabled ? 'left-6' : 'left-1'}`} />
                </span>
              </label>
            </div>
          </div>
        </>
      )}

      {section === 'navigationSettings' && <WorkspaceNavigationSettings onMessage={onMessage} />}

      {section === 'aiSettings' && (
        <>
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-medium text-gray-900">页面加载 AI 图标</div>
                <div className="mt-1 text-sm text-gray-500">开启后，刷新、鉴权和功能页等待时显示当前 AI 图标；关闭后仅显示加载文字。</div>
                <div className="mt-2 text-xs text-gray-500">系统级 AI 外观，保存后对所有客户端生效。</div>
              </div>
              <label className={`inline-flex items-center gap-3 ${settingLoading || settingSaving ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}>
                <span className="text-sm text-gray-600">{loadingIndicatorEnabled ? '已开启' : '已关闭'}</span>
                <input type="checkbox" checked={loadingIndicatorEnabled} disabled={settingLoading || settingSaving} onChange={(event) => saveLoadingIndicator(event.target.checked)} className="sr-only" />
                <span className={`relative h-7 w-12 rounded-full transition ${loadingIndicatorEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${loadingIndicatorEnabled ? 'left-6' : 'left-1'}`} />
                </span>
              </label>
            </div>
          </div>
          <AiAgentSettings onMessage={onMessage} />
        </>
      )}
    </SystemResourcePage>
  )
}

function AiAgentSettings({ onMessage }: { onMessage: (msg: string) => void }) {
  const [config, setConfig] = useState<AiAgentConfigView | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showMarkLab, setShowMarkLab] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [clearStoredApiKey, setClearStoredApiKey] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [form, setForm] = useState({
    enabled: true,
    providerName: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: '',
    timeoutMs: 45000,
    maxToolRounds: 4,
  })

  const applyConfig = useCallback((next: AiAgentConfigView) => {
    setConfig(next)
    setForm({
      enabled: next.enabled,
      providerName: next.providerName,
      baseUrl: next.baseUrl,
      model: next.model,
      timeoutMs: next.timeoutMs,
      maxToolRounds: next.maxToolRounds,
    })
    setApiKey('')
    setClearStoredApiKey(false)
  }, [])

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/ai/config')
      const payload = await response.json()
      if (!response.ok) {
        onMessage(payload.error || '获取 AI 配置失败')
        return
      }
      applyConfig(payload.data)
    } finally {
      setLoading(false)
    }
  }, [applyConfig, onMessage])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const presetKey = aiProviderPresets.find((item) => (
    item.providerName === form.providerName && item.baseUrl === form.baseUrl
  ))?.key || 'custom'

  const save = async () => {
    if (!form.providerName.trim() || !form.baseUrl.trim()) {
      onMessage('请填写 AI 提供商和接口地址')
      return
    }
    if (form.enabled && !form.model.trim()) {
      onMessage('启用 AI 助手前请填写模型 ID')
      return
    }
    if (apiKey.trim() && !config?.storageReady) {
      onMessage('服务器尚未配置 AI_AGENT_CONFIG_SECRET，暂时不能保存页面密钥')
      return
    }
    setSaving(true)
    try {
      const response = await fetch('/api/ai/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          apiKey: apiKey.trim() || undefined,
          clearStoredApiKey,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        onMessage(payload.error || '保存 AI 配置失败')
        return
      }
      applyConfig(payload.data)
      onMessage('AI 助手配置已保存')
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    setTesting(true)
    try {
      const response = await fetch('/api/ai/config', { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) {
        onMessage(payload.error || 'AI 服务连接测试失败')
        return
      }
      onMessage(`AI 服务连接正常，响应约 ${payload.data.latencyMs} ms`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
    <section className="mt-8 border-t border-gray-200 pt-6" aria-labelledby="ai-agent-settings-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 id="ai-agent-settings-title" className="text-base font-semibold text-gray-900">AI 助手配置</h4>
          <p className="mt-1 text-sm text-gray-500">配置国产 OpenAI 兼容模型。页面配置优先于 Coolify 环境变量。</p>
        </div>
        <div className="flex items-center gap-2">
          <AppButton variant="secondary" size="sm" onClick={() => setShowMarkLab(true)}>
            <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
            图标调参
          </AppButton>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${config?.configured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {loading ? '读取中' : config?.configured ? '已配置' : '未配置'}
          </span>
        </div>
      </div>

      {!loading && config && (
        <>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>配置来源：{config.source === 'PAGE' ? '系统页面' : '服务器环境变量'}</span>
            <span>密钥：{config.apiKeyHint || '未配置'}</span>
          </div>

          {!config.storageReady && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              要在本页面保存 API Key，请先在 Coolify 设置一次 `AI_AGENT_CONFIG_SECRET`。在此之前仍可使用环境变量密钥并配置其他字段。
            </div>
          )}
          {config.apiKeyError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              已保存的页面密钥无法解密，请检查 Coolify 中的 `AI_AGENT_CONFIG_SECRET` 是否被修改。
            </div>
          )}

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-3 py-2.5 md:col-span-2">
              <span>
                <span className="block text-sm font-medium text-gray-800">启用 AI 助手</span>
                <span className="mt-0.5 block text-xs text-gray-500">停用后保留配置，但所有账号暂时不能调用模型。</span>
              </span>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </label>

            <label className="text-sm text-gray-700">
              提供商
              <select
                value={presetKey}
                onChange={(event) => {
                  const preset = aiProviderPresets.find((item) => item.key === event.target.value)
                  if (preset) setForm((current) => ({ ...current, providerName: preset.providerName, baseUrl: preset.baseUrl }))
                }}
                className={`mt-1 ${appInputClassName}`}
              >
                {aiProviderPresets.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                <option value="custom">自定义兼容服务</option>
              </select>
            </label>
            <label className="text-sm text-gray-700">
              提供商显示名称
              <input
                value={form.providerName}
                onChange={(event) => setForm((current) => ({ ...current, providerName: event.target.value }))}
                className={`mt-1 ${appInputClassName}`}
                maxLength={50}
              />
            </label>
            <label className="text-sm text-gray-700 md:col-span-2">
              OpenAI 兼容接口地址
              <input
                value={form.baseUrl}
                onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))}
                className={`mt-1 ${appInputClassName}`}
                placeholder="https://.../v1"
                spellCheck={false}
              />
              <span className="mt-1 block text-xs text-gray-500">生产环境仅接受 HTTPS，系统会自动拼接 `/chat/completions`。</span>
            </label>
            <label className="text-sm text-gray-700 md:col-span-2">
              模型 ID
              <input
                value={form.model}
                onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
                className={`mt-1 ${appInputClassName}`}
                placeholder="填写已开通且支持工具调用的模型 ID"
                spellCheck={false}
              />
            </label>
            <label className="text-sm text-gray-700 md:col-span-2">
              API Key
              <span className="relative mt-1 block">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  className={`${appInputClassName} pr-11`}
                  placeholder={config.apiKeyConfigured ? '留空则继续使用现有密钥' : '输入新的 API Key'}
                  autoComplete="new-password"
                  disabled={!config.storageReady}
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((current) => !current)}
                  aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                  title={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-500 hover:text-gray-800 disabled:opacity-40"
                  disabled={!config.storageReady}
                >
                  {showApiKey ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
                </button>
              </span>
            </label>
            {config.storedApiKeyConfigured && (
              <label className="flex items-center gap-2 text-sm text-gray-600 md:col-span-2">
                <input
                  type="checkbox"
                  checked={clearStoredApiKey}
                  onChange={(event) => setClearStoredApiKey(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                清除页面保存的密钥{config.apiKeySource === 'ENV' ? '（清除后继续使用环境变量密钥）' : ''}
              </label>
            )}
            <label className="text-sm text-gray-700">
              请求超时（毫秒）
              <input
                type="number"
                min={5000}
                max={120000}
                step={1000}
                value={form.timeoutMs}
                onChange={(event) => setForm((current) => ({ ...current, timeoutMs: Number(event.target.value) }))}
                className={`mt-1 ${appInputClassName}`}
              />
            </label>
            <label className="text-sm text-gray-700">
              最大工具轮次
              <select
                value={form.maxToolRounds}
                onChange={(event) => setForm((current) => ({ ...current, maxToolRounds: Number(event.target.value) }))}
                className={`mt-1 ${appInputClassName}`}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
            <AppButton variant="secondary" onClick={testConnection} disabled={saving || testing || !config.configured}>
              <PlugZap aria-hidden="true" className="h-4 w-4" />
              {testing ? '测试中' : '测试已保存配置'}
            </AppButton>
            <AppButton variant="primary" onClick={save} disabled={saving || testing}>
              <Save aria-hidden="true" className="h-4 w-4" />
              {saving ? '保存中' : '保存 AI 配置'}
            </AppButton>
          </div>
        </>
      )}
    </section>
    {showMarkLab && (
      <ModalDialog
        title="AI 助手图标调参"
        description="“保存”仅保留当前浏览器预设；点击“应用到系统”后，配置将对所有用户生效。"
        onClose={() => setShowMarkLab(false)}
        size="wide"
        panelClassName="h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)]"
        bodyClassName="overflow-hidden p-0 sm:p-0"
      >
        <iframe
          title="AI 助手图标参数实验室"
          src="/ai/assistant-mark-lab.html"
          className="h-full min-h-[640px] w-full border-0"
        />
      </ModalDialog>
    )}
    </>
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

function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-8">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  )
}

function RecycleBin({ onMessage }: { onMessage: (msg: string) => void }) {
  const [records, setRecords] = useState<DeletedRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [purgingKey, setPurgingKey] = useState('')
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.system.recycle.viewMode', 'list')
  const isCompactViewport = useCompactViewport(1023)
  const effectiveViewMode = isCompactViewport ? 'card' : viewMode
  const recordSort = useClientTableSort(records, {
    type: (record) => record.type,
    label: (record) => record.label,
    deletedAt: (record) => record.deletedAt ? new Date(record.deletedAt) : null,
  }, 'deletedAt', 'desc')

  useEffect(() => {
    fetchDeletedRecords()
  }, [])

  const flattenRecords = (data: any): DeletedRecord[] => {
    const rows: DeletedRecord[] = []
    ;(data.materials || []).forEach((item: any) => rows.push({ id: item.id, label: item.code, type: '物料', model: 'material', deletedAt: item.deletedAt }))
    ;(data.suppliers || []).forEach((item: any) => rows.push({ id: item.id, label: item.name, type: '供应商', model: 'supplier', deletedAt: item.deletedAt }))
    ;(data.customers || []).forEach((item: any) => rows.push({ id: item.id, label: item.name, type: '客户', model: 'customer', deletedAt: item.deletedAt }))
    ;(data.materialIn || []).forEach((item: any) => rows.push({ id: item.id, label: item.inboundNo, type: '来料单', model: 'materialIn', deletedAt: item.deletedAt }))
    ;(data.workInstructions || []).forEach((item: any) => rows.push({ id: item.id, label: `${item.material?.code || '-'} · ${item.material?.name || '未知产品'}`, type: '产品文档', model: 'workInstruction', deletedAt: item.deletedAt }))
    ;(data.orders || []).forEach((item: any) => rows.push({ id: item.id, label: item.orderNo, type: '工单', model: 'order', deletedAt: item.deletedAt }))
    ;(data.dispatches || []).forEach((item: any) => rows.push({ id: item.id, label: item.dispatchNo, type: '派工单', model: 'dispatch', deletedAt: item.deletedAt }))
    ;(data.shipments || []).forEach((item: any) => rows.push({ id: item.id, label: item.shipmentNo, type: '发货单', model: 'shipment', deletedAt: item.deletedAt }))
    ;(data.returns || []).forEach((item: any) => rows.push({ id: item.id, label: item.returnNo, type: '退货单', model: 'return', deletedAt: item.deletedAt }))
    return rows.sort((a, b) => String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')))
  }

  const fetchDeletedRecords = async () => {
    setLoading(true)
    const res = await fetch('/api/deleted-records')
    const data = await res.json()
    if (res.ok) {
      setRecords(flattenRecords(data.data || {}))
    } else {
      onMessage(data.error || '获取归档记录失败')
    }
    setLoading(false)
  }

  const restore = async (record: DeletedRecord) => {
    const res = await fetch('/api/restore', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: record.model, id: record.id }),
    })
    const data = await res.json()
    if (res.ok) {
      onMessage('记录已恢复归档')
      await fetchDeletedRecords()
    } else {
      onMessage(data.error || '恢复归档失败')
    }
  }

  const purge = async (record: DeletedRecord) => {
    const confirmation = window.prompt(
      `永久删除「${record.label}」后不能恢复。若确认继续，请输入“永久删除”：`,
    )
    if (confirmation === null) return
    if (confirmation !== '永久删除') {
      onMessage('输入内容不一致，已取消永久删除')
      return
    }

    const key = `${record.model}-${record.id}`
    setPurgingKey(key)
    try {
      const res = await fetch('/api/deleted-records', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: record.model, id: record.id, confirmation: '永久删除' }),
      })
      const data = await res.json()
      if (res.ok) {
        onMessage('归档记录已永久删除')
        await fetchDeletedRecords()
      } else {
        onMessage(data.error || '永久删除失败')
      }
    } finally {
      setPurgingKey('')
    }
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow sm:p-6">
      <SystemPageToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        actions={<AppButton onClick={fetchDeletedRecords}>刷新</AppButton>}
      />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">归档记录</h3>
          <p className="text-sm text-gray-500 mt-1">归档记录可以恢复；没有有效库存和下游业务引用时可永久删除并释放编码，完整红冲且净影响为零的来料历史会一并清理。</p>
        </div>
      </div>
      {effectiveViewMode === 'card' && records.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {recordSort.sortedRows.map((record) => (
            <div key={`${record.model}-${record.id}`} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-sm font-semibold text-blue-700">{record.label}</div>
                  <div className="mt-1 text-sm text-gray-500">{record.type}</div>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <button onClick={() => restore(record)} className="px-3 py-1 text-blue-600 border border-blue-300 rounded text-xs hover:bg-blue-50">恢复归档</button>
                  <button
                    onClick={() => purge(record)}
                    disabled={purgingKey === `${record.model}-${record.id}`}
                    className="rounded border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {purgingKey === `${record.model}-${record.id}` ? '删除中...' : '永久删除'}
                  </button>
                </div>
              </div>
              <div className="mt-4 text-xs text-gray-500">归档时间：{record.deletedAt ? new Date(record.deletedAt).toLocaleString('zh-CN') : '-'}</div>
            </div>
          ))}
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <SortableTableHeader column="type" activeColumn={recordSort.sortColumn} direction={recordSort.sortDirection} onSort={recordSort.toggleSort}>类型</SortableTableHeader>
              <SortableTableHeader column="label" activeColumn={recordSort.sortColumn} direction={recordSort.sortDirection} onSort={recordSort.toggleSort}>编号</SortableTableHeader>
              <SortableTableHeader column="deletedAt" activeColumn={recordSort.sortColumn} direction={recordSort.sortDirection} onSort={recordSort.toggleSort}>归档时间</SortableTableHeader>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {recordSort.sortedRows.map((record) => (
              <tr key={`${record.model}-${record.id}`} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">{record.type}</td>
                <td className="px-4 py-3 font-mono text-sm text-blue-700">{record.label}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{record.deletedAt ? new Date(record.deletedAt).toLocaleString('zh-CN') : '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => restore(record)} className="px-3 py-1 text-blue-600 border border-blue-300 rounded text-xs hover:bg-blue-50">恢复归档</button>
                    <button
                      onClick={() => purge(record)}
                      disabled={purgingKey === `${record.model}-${record.id}`}
                      className="rounded border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {purgingKey === `${record.model}-${record.id}` ? '删除中...' : '永久删除'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {!loading && records.length === 0 && <div className="text-center py-12 text-gray-500">暂无归档记录</div>}
    </div>
  )
}

function AuditLogViewer({ onMessage }: { onMessage: (msg: string) => void }) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.system.audit.viewMode', 'list')
  const isCompactViewport = useCompactViewport(1023)
  const effectiveViewMode = isCompactViewport ? 'card' : viewMode
  const auditSort = useClientTableSort(logs, {
    createdAt: (log) => new Date(log.createdAt),
    operator: (log) => log.operatorName,
    action: (log) => log.action,
    entity: (log) => `${log.entityType} ${log.entityLabel || log.entityId || ''}`,
    note: (log) => log.note,
  }, 'createdAt', 'desc')

  useEffect(() => {
    fetchLogs()
  }, [])

  const fetchLogs = async () => {
    setLoading(true)
    const res = await fetch('/api/audit-logs?pageSize=100')
    const data = await res.json()
    if (res.ok) {
      setLogs(data.data || [])
    } else {
      onMessage(data.error || '获取操作记录失败')
    }
    setLoading(false)
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow sm:p-6">
      <SystemPageToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        actions={<AppButton onClick={fetchLogs}>刷新</AppButton>}
      />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">操作记录</h3>
          <p className="text-sm text-gray-500 mt-1">记录新增、修改、归档、恢复、收货、盘点等关键操作。</p>
        </div>
      </div>
      {effectiveViewMode === 'card' && logs.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {auditSort.sortedRows.map((log) => (
            <div key={log.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="font-semibold text-gray-900">{log.action}</div>
                <div className="text-xs text-gray-500">{new Date(log.createdAt).toLocaleString('zh-CN')}</div>
              </div>
              <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <div className="text-xs text-gray-500">人员</div>
                  <div className="mt-1">{log.operatorName || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">对象</div>
                  <div className="mt-1">{log.entityType} {log.entityLabel || log.entityId || ''}</div>
                </div>
              </div>
              <div className="mt-3 rounded bg-gray-50 p-3 text-sm text-gray-600">{log.note || '-'}</div>
            </div>
          ))}
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <SortableTableHeader column="createdAt" activeColumn={auditSort.sortColumn} direction={auditSort.sortDirection} onSort={auditSort.toggleSort}>时间</SortableTableHeader>
              <SortableTableHeader column="operator" activeColumn={auditSort.sortColumn} direction={auditSort.sortDirection} onSort={auditSort.toggleSort}>人员</SortableTableHeader>
              <SortableTableHeader column="action" activeColumn={auditSort.sortColumn} direction={auditSort.sortDirection} onSort={auditSort.toggleSort}>动作</SortableTableHeader>
              <SortableTableHeader column="entity" activeColumn={auditSort.sortColumn} direction={auditSort.sortDirection} onSort={auditSort.toggleSort}>对象</SortableTableHeader>
              <SortableTableHeader column="note" activeColumn={auditSort.sortColumn} direction={auditSort.sortDirection} onSort={auditSort.toggleSort}>备注</SortableTableHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {auditSort.sortedRows.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(log.createdAt).toLocaleString('zh-CN')}</td>
                <td className="px-4 py-3 text-sm">{log.operatorName || '-'}</td>
                <td className="px-4 py-3 text-sm font-medium">{log.action}</td>
                <td className="px-4 py-3 text-sm">{log.entityType} {log.entityLabel || log.entityId || ''}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{log.note || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {!loading && logs.length === 0 && <div className="text-center py-12 text-gray-500">暂无操作记录</div>}
    </div>
  )
}
