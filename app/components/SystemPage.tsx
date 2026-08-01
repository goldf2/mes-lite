'use client'

import { useCallback, useEffect, useState } from 'react'
import ViewModeToggle, { usePersistedViewMode } from './ViewModeToggle'
import { useModalGlassPreference } from './interfacePreferences'
import MaterialChoiceSearch from './MaterialChoiceSearch'
import { SearchFieldWithPresets } from './SavedSearchPresets'
import useCompactViewport from './useCompactViewport'
import DataIntegrityPanel from './DataIntegrityPanel'
import SearchableSelect from './SearchableSelect'
import SortableTableHeader from './SortableTableHeader'
import useClientTableSort from './useClientTableSort'

interface Supplier {
  id: string
  code: string
  name: string
  contact?: string | null
  phone?: string | null
  address?: string | null
  createdAt: string
}

interface Customer {
  id: string
  code: string
  name: string
  contact?: string | null
  phone?: string | null
  address?: string | null
  createdAt: string
}

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

type MeasureType = 'LENGTH' | 'WEIGHT' | 'QUANTITY' | 'OTHER'

interface ConfiguredUnit {
  code: string
  name: string
  measureType: MeasureType
  toBaseFactor: number
  isBase: boolean
  isPreset: boolean
  usedByMaterialCount: number
}

interface InventoryLocationConfig {
  id: string
  code: string
  name: string
  note?: string | null
  isDefault: boolean
  isActive: boolean
  materialCount: number
  qty: number
  reservedQty: number
  availableQty: number
}

const measureTypeOptions: Array<[MeasureType, string, string]> = [
  ['LENGTH', '长度', 'm'],
  ['WEIGHT', '重量', 'kg'],
  ['QUANTITY', '数量', '件'],
  ['OTHER', '其他', '项'],
]

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

export type SystemSection = 'suppliers' | 'customers' | 'processTemplates' | 'process' | 'recycle' | 'audit' | 'dataTools' | 'units' | 'locations' | 'preferences'

export default function SystemPage({
  section,
  onMessage,
}: {
  section: SystemSection
  onMessage: (msg: string) => void
}) {
  return (
    <>
      {section === 'suppliers' && <SupplierManager onMessage={onMessage} />}
      {section === 'customers' && <CustomerManager onMessage={onMessage} />}
      {section === 'processTemplates' && <ProcessTemplateManager onMessage={onMessage} />}
      {section === 'process' && <ProcessManager onMessage={onMessage} />}
      {section === 'recycle' && <RecycleBin onMessage={onMessage} />}
      {section === 'audit' && <AuditLogViewer onMessage={onMessage} />}
      {section === 'dataTools' && <DataToolManager onMessage={onMessage} />}
      {section === 'units' && <UnitCatalogManager onMessage={onMessage} />}
      {section === 'locations' && <InventoryLocationManager onMessage={onMessage} />}
      {section === 'preferences' && <InterfacePreferenceManager onMessage={onMessage} />}
    </>
  )
}

function InventoryLocationManager({ onMessage }: { onMessage: (msg: string) => void }) {
  const emptyForm = { code: '', name: '', note: '', isDefault: false, isActive: true }
  const [locations, setLocations] = useState<InventoryLocationConfig[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<InventoryLocationConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const locationSort = useClientTableSort(locations, {
    location: (location) => `${location.code} ${location.name}`,
    status: (location) => location.isDefault ? '默认' : location.isActive ? '启用' : '已归档',
    materialCount: (location) => location.materialCount,
    qty: (location) => location.qty,
  }, 'location', 'asc')

  const loadLocations = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/inventory-locations?includeInactive=1')
      const data = await res.json()
      if (!res.ok) return onMessage(data.error || '获取库位失败')
      setLocations(data.data || [])
    } finally {
      setLoading(false)
    }
  }, [onMessage])

  useEffect(() => { loadLocations() }, [loadLocations])

  const reset = () => {
    setEditing(null)
    setForm(emptyForm)
  }

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) return onMessage('请填写库位编码和名称')
    setSaving(true)
    try {
      const res = await fetch('/api/inventory-locations', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { ...form, id: editing.id } : form),
      })
      const data = await res.json()
      if (!res.ok) return onMessage(data.error || '保存库位失败')
      setLocations(data.data || [])
      onMessage(editing ? '库位已更新' : '库位已新增')
      reset()
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (location: InventoryLocationConfig) => {
    setEditing(location)
    setForm({
      code: location.code,
      name: location.name,
      note: location.note || '',
      isDefault: location.isDefault,
      isActive: location.isActive,
    })
  }

  const archive = async (location: InventoryLocationConfig) => {
    if (!confirm(`确认归档库位“${location.code} · ${location.name}”吗？`)) return
    const res = await fetch(`/api/inventory-locations?id=${encodeURIComponent(location.id)}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) return onMessage(data.error || '归档库位失败')
    setLocations(data.data || [])
    onMessage('库位已归档')
  }

  const makeDefault = async (location: InventoryLocationConfig) => {
    const res = await fetch('/api/inventory-locations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: location.id, isDefault: true, isActive: true }),
    })
    const data = await res.json()
    if (!res.ok) return onMessage(data.error || '设置默认库位失败')
    setLocations(data.data || [])
    onMessage(`默认库位已设为 ${location.code}`)
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg bg-white p-4 shadow sm:p-6">
        <h3 className="text-lg font-semibold">库位配置</h3>
        <p className="mt-1 text-sm text-gray-500">总库存继续统一核算；库位用于来料、生产日报和发货的实物数量分布与校验。</p>
        <div className="mt-5 grid grid-cols-1 gap-3 rounded-lg border border-blue-100 bg-blue-50/40 p-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-sm text-gray-700">库位编码
            <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2" placeholder="如 A01" />
          </label>
          <label className="text-sm text-gray-700">库位名称
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2" placeholder="如 成品区" />
          </label>
          <label className="text-sm text-gray-700 xl:col-span-2">备注
            <input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2" />
          </label>
          <div className="flex items-end gap-2">
            <button type="button" onClick={save} disabled={saving} className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? '保存中...' : editing ? '保存修改' : '新增库位'}</button>
            {editing && <button type="button" onClick={reset} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">取消</button>}
          </div>
          <div className="flex flex-wrap gap-5 md:col-span-2 xl:col-span-5">
            <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} />设为默认库位</label>
            {editing && <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.isActive} disabled={editing.isDefault || editing.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />{editing.isActive ? '已启用（请用归档操作停用）' : '恢复启用'}</label>}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg bg-white shadow">
        {loading ? <div className="py-12 text-center text-sm text-gray-500">加载中...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-gray-50 text-left text-sm text-gray-600"><tr><SortableTableHeader column="location" activeColumn={locationSort.sortColumn} direction={locationSort.sortDirection} onSort={locationSort.toggleSort}>库位</SortableTableHeader><SortableTableHeader column="status" activeColumn={locationSort.sortColumn} direction={locationSort.sortDirection} onSort={locationSort.toggleSort}>状态</SortableTableHeader><SortableTableHeader column="materialCount" activeColumn={locationSort.sortColumn} direction={locationSort.sortDirection} onSort={locationSort.toggleSort}>物料数</SortableTableHeader><SortableTableHeader column="qty" activeColumn={locationSort.sortColumn} direction={locationSort.sortDirection} onSort={locationSort.toggleSort}>库存 / 占用 / 可用</SortableTableHeader><th className="px-4 py-3 text-right">操作</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {locationSort.sortedRows.map((location) => (
                  <tr key={location.id} className={!location.isActive ? 'bg-gray-50 text-gray-400' : ''}>
                    <td className="px-4 py-3"><div className="font-medium">{location.code} · {location.name}</div>{location.note && <div className="mt-1 text-xs text-gray-500">{location.note}</div>}</td>
                    <td className="px-4 py-3 text-sm">{location.isDefault ? <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">默认</span> : location.isActive ? '启用' : '已归档'}</td>
                    <td className="px-4 py-3 text-sm">{location.materialCount}</td>
                    <td className="px-4 py-3 font-mono text-sm">{location.qty} / {location.reservedQty} / {location.availableQty}</td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-2"><button type="button" onClick={() => startEdit(location)} className="rounded border border-gray-200 px-3 py-1.5 text-xs">编辑</button>{location.isActive && !location.isDefault && <><button type="button" onClick={() => makeDefault(location)} className="rounded border border-blue-200 px-3 py-1.5 text-xs text-blue-700">设为默认</button><button type="button" onClick={() => archive(location)} className="rounded border border-red-200 px-3 py-1.5 text-xs text-red-700">归档</button></>}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function UnitCatalogManager({ onMessage }: { onMessage: (msg: string) => void }) {
  const emptyForm = { code: '', name: '', measureType: 'LENGTH' as MeasureType, toBaseFactor: 1 }
  const [units, setUnits] = useState<ConfiguredUnit[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<ConfiguredUnit | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const baseUnit = measureTypeOptions.find(([measure]) => measure === form.measureType)?.[2] || '基准单位'
  const unitSort = useClientTableSort(units, {
    unit: (unit) => `${unit.name} ${unit.code}`,
    factor: (unit) => unit.toBaseFactor,
    usage: (unit) => unit.usedByMaterialCount,
  }, 'unit', 'asc')

  const loadUnits = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/system/units')
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '获取单位配置失败')
        return
      }
      setUnits(data.data || [])
    } finally {
      setLoading(false)
    }
  }, [onMessage])

  useEffect(() => {
    loadUnits()
  }, [loadUnits])

  const resetForm = () => {
    setEditing(null)
    setForm(emptyForm)
  }

  const save = async () => {
    if (!form.code.trim() || !form.name.trim() || !Number.isFinite(form.toBaseFactor) || form.toBaseFactor <= 0) {
      onMessage('请填写有效的单位编码、名称和换算系数')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/system/units', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? {
          ...form,
          originalCode: editing.code,
          originalMeasureType: editing.measureType,
        } : form),
      })
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '保存单位失败')
        return
      }
      setUnits(data.data || [])
      onMessage(editing ? '单位配置已更新' : '自定义单位已添加')
      resetForm()
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (unit: ConfiguredUnit) => {
    setEditing(unit)
    setForm({
      code: unit.code,
      name: unit.name,
      measureType: unit.measureType,
      toBaseFactor: unit.toBaseFactor,
    })
  }

  const remove = async (unit: ConfiguredUnit) => {
    if (!confirm(`确认删除自定义单位“${unit.name}（${unit.code}）”吗？`)) return
    const params = new URLSearchParams({ code: unit.code, measureType: unit.measureType })
    const res = await fetch(`/api/system/units?${params.toString()}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) {
      onMessage(data.error || '删除单位失败')
      return
    }
    setUnits(data.data || [])
    if (editing?.code === unit.code && editing.measureType === unit.measureType) resetForm()
    onMessage('自定义单位已删除')
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-4 shadow sm:p-6">
        <div className="mb-5">
          <h3 className="text-lg font-semibold">单位配置</h3>
          <p className="mt-1 text-sm text-gray-500">物料只能选择已配置单位；自定义单位必须明确换算到所属计量方式的系统基准单位。</p>
        </div>
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-blue-100 bg-blue-50/40 p-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-sm text-gray-700">
            计量方式
            <select
              value={form.measureType}
              disabled={Boolean(editing?.usedByMaterialCount)}
              onChange={(event) => setForm({ ...form, measureType: event.target.value as MeasureType })}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2"
            >
              {measureTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm text-gray-700">
            单位编码
            <input
              value={form.code}
              disabled={Boolean(editing?.usedByMaterialCount)}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2"
              placeholder="如：ft"
            />
          </label>
          <label className="text-sm text-gray-700">
            显示名称
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2"
              placeholder="如：英尺"
            />
          </label>
          <label className="text-sm text-gray-700">
            换算到 {baseUnit}
            <span className="mt-1 flex overflow-hidden rounded-lg border border-gray-200 bg-white">
              <input
                type="number"
                min="0"
                step="any"
                disabled={Boolean(editing?.usedByMaterialCount)}
                value={form.toBaseFactor || ''}
                onChange={(event) => setForm({ ...form, toBaseFactor: Number(event.target.value) })}
                className="min-w-0 flex-1 px-3 py-2 text-right outline-none"
              />
              <span className="flex items-center border-l border-gray-200 bg-gray-50 px-3 text-xs text-gray-600">{baseUnit}</span>
            </span>
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? '保存中...' : editing ? '保存修改' : '添加单位'}
            </button>
            {editing && <button type="button" onClick={resetForm} className="rounded-lg border border-gray-200 px-4 py-2 text-sm">取消</button>}
          </div>
          <div className="md:col-span-2 xl:col-span-5 text-xs text-gray-500">
            关系定义：1 自定义单位 = 换算系数 × {baseUnit}。单位一旦被物料使用，只允许修改显示名称。
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg bg-white p-6 text-sm text-gray-500 shadow">正在读取单位配置...</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {measureTypeOptions.map(([measureType, label, base]) => {
            const rows = unitSort.sortedRows.filter((unit) => unit.measureType === measureType)
            return (
              <div key={measureType} className="rounded-lg bg-white p-4 shadow sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-semibold text-gray-900">{label}单位</h4>
                  <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">基准：{base}</span>
                </div>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-gray-600">
                      <tr><SortableTableHeader column="unit" activeColumn={unitSort.sortColumn} direction={unitSort.sortDirection} onSort={unitSort.toggleSort} className="px-3 py-2">单位</SortableTableHeader><SortableTableHeader column="factor" activeColumn={unitSort.sortColumn} direction={unitSort.sortDirection} onSort={unitSort.toggleSort} className="px-3 py-2">换算关系</SortableTableHeader><SortableTableHeader column="usage" activeColumn={unitSort.sortColumn} direction={unitSort.sortDirection} onSort={unitSort.toggleSort} className="px-3 py-2">使用</SortableTableHeader><th className="px-3 py-2 text-right">操作</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((unit) => (
                        <tr key={`${unit.measureType}-${unit.code}`}>
                          <td className="px-3 py-2"><span className="font-medium">{unit.name}</span><span className="ml-2 font-mono text-xs text-gray-500">{unit.code}</span>{unit.isPreset && <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">预置</span>}</td>
                          <td className="px-3 py-2 text-gray-600">1 {unit.code} = {unit.toBaseFactor} {base}</td>
                          <td className="px-3 py-2 text-gray-600">{unit.usedByMaterialCount} 个物料</td>
                          <td className="px-3 py-2 text-right">
                            {!unit.isPreset && (
                              <span className="inline-flex gap-2">
                                <button type="button" onClick={() => startEdit(unit)} className="text-blue-600">编辑</button>
                                <button type="button" onClick={() => remove(unit)} className="text-red-600">删除</button>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
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

function InterfacePreferenceManager({ onMessage }: { onMessage: (msg: string) => void }) {
  const [modalGlassEnabled, setModalGlassEnabled] = useModalGlassPreference()
  const [naturalCodeSortEnabled, setNaturalCodeSortEnabled] = useState(false)
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
    } finally {
      setSettingLoading(false)
    }
  }, [onMessage])

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

  return (
    <div className="rounded-lg bg-white p-4 shadow sm:p-6">
      <div className="mb-5">
        <h3 className="text-lg font-semibold">系统设置</h3>
        <p className="mt-1 text-sm text-gray-500">业务规则对所有客户端生效；界面偏好只保存在当前浏览器。</p>
      </div>

      <div className="rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-medium text-gray-900">物料编码数字自然排序</div>
            <div className="mt-1 text-sm text-gray-500">开启后，物料列表和导出中的编码按数字片段排序，例如 2 排在 12 前、A2 排在 A10 前；不会修改编码内容。</div>
            <div className="mt-2 text-xs text-gray-500">系统级设置，保存后对所有客户端生效。</div>
          </div>
          <label className={`inline-flex items-center gap-3 ${settingLoading || settingSaving ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}>
            <span className="text-sm text-gray-600">
              {settingLoading ? '读取中' : settingSaving ? '保存中' : naturalCodeSortEnabled ? '已开启' : '已关闭'}
            </span>
            <input
              type="checkbox"
              checked={naturalCodeSortEnabled}
              disabled={settingLoading || settingSaving}
              onChange={(event) => saveNaturalCodeSort(event.target.checked)}
              className="sr-only"
            />
            <span className={`relative h-7 w-12 rounded-full transition ${naturalCodeSortEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${naturalCodeSortEnabled ? 'left-6' : 'left-1'}`} />
            </span>
          </label>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-medium text-gray-900">弹窗背景磨砂玻璃</div>
            <div className="mt-1 text-sm text-gray-500">开启后弹窗出现时背景会模糊并遮罩；关闭后仅保留半透明遮罩，仍会屏蔽底层按钮响应。</div>
            <div className="mt-2 text-xs text-gray-500">界面偏好，只保存在当前浏览器。</div>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-3">
            <span className="text-sm text-gray-600">{modalGlassEnabled ? '已开启' : '已关闭'}</span>
            <input
              type="checkbox"
              checked={modalGlassEnabled}
              onChange={(event) => setModalGlassEnabled(event.target.checked)}
              className="sr-only"
            />
            <span className={`relative h-7 w-12 rounded-full transition ${modalGlassEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${modalGlassEnabled ? 'left-6' : 'left-1'}`} />
            </span>
          </label>
        </div>
      </div>
    </div>
  )
}

function SupplierManager({ onMessage }: { onMessage: (msg: string) => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [keyword, setKeyword] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.system.suppliers.viewMode', 'list')
  const isCompactViewport = useCompactViewport(1023)
  const effectiveViewMode = isCompactViewport ? 'card' : viewMode
  const [form, setForm] = useState({
    name: '',
    contact: '',
    phone: '',
    address: '',
  })
  const supplierSort = useClientTableSort(suppliers, {
    name: (supplier) => supplier.name,
    contact: (supplier) => supplier.contact,
    phone: (supplier) => supplier.phone,
    address: (supplier) => supplier.address,
    createdAt: (supplier) => new Date(supplier.createdAt),
  }, 'createdAt', 'desc')

  useEffect(() => {
    fetchSuppliers()
  }, [keyword])

  const fetchSuppliers = async () => {
    const url = keyword ? `/api/suppliers?keyword=${encodeURIComponent(keyword)}` : '/api/suppliers'
    const res = await fetch(url)
    const data = await res.json()
    if (res.ok) {
      setSuppliers(data.data || [])
    } else {
      onMessage(data.error || '获取供应商失败')
    }
  }

  const resetForm = () => {
    setForm({ name: '', contact: '', phone: '', address: '' })
    setEditingSupplier(null)
  }

  const openAdd = () => {
    resetForm()
    setShowModal(true)
  }

  const openEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    setForm({
      name: supplier.name,
      contact: supplier.contact || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
    })
    setShowModal(true)
  }

  const submit = async () => {
    if (!form.name) {
      onMessage('供应商名称必填')
      return
    }

    setLoading(true)
    const res = await fetch('/api/suppliers', {
      method: editingSupplier ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        id: editingSupplier?.id,
        contact: form.contact || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      onMessage(editingSupplier ? '供应商已更新' : '供应商已创建')
      setShowModal(false)
      resetForm()
      await fetchSuppliers()
    } else {
      onMessage(data.error || '操作失败')
    }
    setLoading(false)
  }

  const remove = async (supplier: Supplier) => {
    if (!confirm(`确定归档供应商「${supplier.name}」吗？归档后可在归档记录中恢复。`)) return
    const res = await fetch(`/api/suppliers?id=${supplier.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (res.ok) {
      onMessage('供应商已归档')
      await fetchSuppliers()
    } else {
      onMessage(data.error || '归档失败')
    }
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">供应商管理</h3>
          <p className="text-sm text-gray-500 mt-1">用于来料单选择供应商，不再使用的供应商只能归档。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <div className="hidden lg:block">
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>
          <SearchFieldWithPresets
            storageKey="mes-lite.searchPresets.suppliers"
            value={keyword}
            onChange={setKeyword}
            placeholder="搜索名称、联系人、电话"
            className="flex w-full items-center gap-2 sm:w-[420px]"
          />
          <button onClick={openAdd} className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 sm:w-auto">
            新增供应商
          </button>
        </div>
      </div>

      {effectiveViewMode === 'card' && suppliers.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {supplierSort.sortedRows.map((supplier) => (
            <div key={supplier.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-gray-900">{supplier.name}</div>
                </div>
                <button onClick={() => openEdit(supplier)} className="shrink-0 px-3 py-1 text-blue-600 border border-blue-300 rounded text-xs hover:bg-blue-50">
                  编辑
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500">联系人</div>
                  <div className="mt-1">{supplier.contact || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">电话</div>
                  <div className="mt-1">{supplier.phone || '-'}</div>
                </div>
              </div>
              <div className="mt-3 text-sm text-gray-600">地址：{supplier.address || '-'}</div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-xs text-gray-500">{new Date(supplier.createdAt).toLocaleString('zh-CN')}</div>
                <button onClick={() => remove(supplier)} className="px-3 py-1 text-red-600 border border-red-300 rounded text-xs hover:bg-red-50">
                  归档
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <SortableTableHeader column="name" activeColumn={supplierSort.sortColumn} direction={supplierSort.sortDirection} onSort={supplierSort.toggleSort}>名称</SortableTableHeader>
              <SortableTableHeader column="contact" activeColumn={supplierSort.sortColumn} direction={supplierSort.sortDirection} onSort={supplierSort.toggleSort}>联系人</SortableTableHeader>
              <SortableTableHeader column="phone" activeColumn={supplierSort.sortColumn} direction={supplierSort.sortDirection} onSort={supplierSort.toggleSort}>电话</SortableTableHeader>
              <SortableTableHeader column="address" activeColumn={supplierSort.sortColumn} direction={supplierSort.sortDirection} onSort={supplierSort.toggleSort}>地址</SortableTableHeader>
              <SortableTableHeader column="createdAt" activeColumn={supplierSort.sortColumn} direction={supplierSort.sortDirection} onSort={supplierSort.toggleSort}>创建时间</SortableTableHeader>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {supplierSort.sortedRows.map((supplier) => (
              <tr key={supplier.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-sm">{supplier.name}</td>
                <td className="px-4 py-3 text-sm">{supplier.contact || '-'}</td>
                <td className="px-4 py-3 text-sm">{supplier.phone || '-'}</td>
                <td className="px-4 py-3 text-sm max-w-xs truncate">{supplier.address || '-'}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(supplier.createdAt).toLocaleString('zh-CN')}</td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(supplier)} className="px-3 py-1 text-blue-600 border border-blue-300 rounded text-xs hover:bg-blue-50">
                    编辑
                  </button>
                  <button onClick={() => remove(supplier)} className="ml-2 px-3 py-1 text-red-600 border border-red-300 rounded text-xs hover:bg-red-50">
                    归档
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {suppliers.length === 0 && <div className="text-center py-12 text-gray-500">暂无供应商</div>}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center mes-modal-overlay p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">{editingSupplier ? '编辑供应商' : '新增供应商'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">&times;</button>
            </div>
            <div className="p-4 space-y-4">
              <Field label="供应商名称 *" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
              <div className="grid grid-cols-2 gap-4">
                <Field label="联系人" value={form.contact} onChange={(value) => setForm({ ...form, contact: value })} />
                <Field label="电话" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">地址</label>
                <textarea
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={submit} disabled={loading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {loading ? '保存中...' : '保存'}
                </button>
                <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CustomerManager({ onMessage }: { onMessage: (msg: string) => void }) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [keyword, setKeyword] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.system.customers.viewMode', 'list')
  const isCompactViewport = useCompactViewport(1023)
  const effectiveViewMode = isCompactViewport ? 'card' : viewMode
  const [form, setForm] = useState({
    name: '',
    contact: '',
    phone: '',
    address: '',
  })
  const customerSort = useClientTableSort(customers, {
    name: (customer) => customer.name,
    contact: (customer) => customer.contact,
    phone: (customer) => customer.phone,
    address: (customer) => customer.address,
    createdAt: (customer) => new Date(customer.createdAt),
  }, 'createdAt', 'desc')

  useEffect(() => {
    fetchCustomers()
  }, [keyword])

  const fetchCustomers = async () => {
    const url = keyword ? `/api/customers?keyword=${encodeURIComponent(keyword)}` : '/api/customers'
    const res = await fetch(url)
    const data = await res.json()
    if (res.ok) {
      setCustomers(data.data || [])
    } else {
      onMessage(data.error || '获取客户失败')
    }
  }

  const resetForm = () => {
    setForm({ name: '', contact: '', phone: '', address: '' })
    setEditingCustomer(null)
  }

  const openAdd = () => {
    resetForm()
    setShowModal(true)
  }

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer)
    setForm({
      name: customer.name,
      contact: customer.contact || '',
      phone: customer.phone || '',
      address: customer.address || '',
    })
    setShowModal(true)
  }

  const submit = async () => {
    if (!form.name) {
      onMessage('客户名称必填')
      return
    }

    setLoading(true)
    const res = await fetch('/api/customers', {
      method: editingCustomer ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        id: editingCustomer?.id,
        contact: form.contact || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      onMessage(editingCustomer ? '客户已更新' : '客户已创建')
      setShowModal(false)
      resetForm()
      await fetchCustomers()
    } else {
      onMessage(data.error || '操作失败')
    }
    setLoading(false)
  }

  const remove = async (customer: Customer) => {
    if (!confirm(`确定归档客户「${customer.name}」吗？归档后可在归档记录中恢复。`)) return
    const res = await fetch(`/api/customers?id=${customer.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (res.ok) {
      onMessage('客户已归档')
      await fetchCustomers()
    } else {
      onMessage(data.error || '归档失败')
    }
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">客户管理</h3>
          <p className="text-sm text-gray-500 mt-1">用于按最终客户筛选物料、库存和发货记录。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <div className="hidden lg:block">
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>
          <SearchFieldWithPresets
            storageKey="mes-lite.searchPresets.customers"
            value={keyword}
            onChange={setKeyword}
            placeholder="搜索名称、联系人、电话"
            className="flex w-full items-center gap-2 sm:w-[420px]"
          />
          <button onClick={openAdd} className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 sm:w-auto">
            新增客户
          </button>
        </div>
      </div>

      {effectiveViewMode === 'card' && customers.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {customerSort.sortedRows.map((customer) => (
            <div key={customer.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-gray-900">{customer.name}</div>
                </div>
                <button onClick={() => openEdit(customer)} className="shrink-0 px-3 py-1 text-blue-600 border border-blue-300 rounded text-xs hover:bg-blue-50">
                  编辑
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500">联系人</div>
                  <div className="mt-1">{customer.contact || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">电话</div>
                  <div className="mt-1">{customer.phone || '-'}</div>
                </div>
              </div>
              <div className="mt-3 text-sm text-gray-600">地址：{customer.address || '-'}</div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-xs text-gray-500">{new Date(customer.createdAt).toLocaleString('zh-CN')}</div>
                <button onClick={() => remove(customer)} className="px-3 py-1 text-red-600 border border-red-300 rounded text-xs hover:bg-red-50">
                  归档
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <SortableTableHeader column="name" activeColumn={customerSort.sortColumn} direction={customerSort.sortDirection} onSort={customerSort.toggleSort}>名称</SortableTableHeader>
              <SortableTableHeader column="contact" activeColumn={customerSort.sortColumn} direction={customerSort.sortDirection} onSort={customerSort.toggleSort}>联系人</SortableTableHeader>
              <SortableTableHeader column="phone" activeColumn={customerSort.sortColumn} direction={customerSort.sortDirection} onSort={customerSort.toggleSort}>电话</SortableTableHeader>
              <SortableTableHeader column="address" activeColumn={customerSort.sortColumn} direction={customerSort.sortDirection} onSort={customerSort.toggleSort}>地址</SortableTableHeader>
              <SortableTableHeader column="createdAt" activeColumn={customerSort.sortColumn} direction={customerSort.sortDirection} onSort={customerSort.toggleSort}>创建时间</SortableTableHeader>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {customerSort.sortedRows.map((customer) => (
              <tr key={customer.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-sm">{customer.name}</td>
                <td className="px-4 py-3 text-sm">{customer.contact || '-'}</td>
                <td className="px-4 py-3 text-sm">{customer.phone || '-'}</td>
                <td className="px-4 py-3 text-sm max-w-xs truncate">{customer.address || '-'}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(customer.createdAt).toLocaleString('zh-CN')}</td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(customer)} className="px-3 py-1 text-blue-600 border border-blue-300 rounded text-xs hover:bg-blue-50">
                    编辑
                  </button>
                  <button onClick={() => remove(customer)} className="ml-2 px-3 py-1 text-red-600 border border-red-300 rounded text-xs hover:bg-red-50">
                    归档
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {customers.length === 0 && <div className="text-center py-12 text-gray-500">暂无客户</div>}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center mes-modal-overlay p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">{editingCustomer ? '编辑客户' : '新增客户'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">&times;</button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <Field label="客户名称 *" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="联系人" value={form.contact} onChange={(value) => setForm({ ...form, contact: value })} />
                <Field label="电话" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">地址</label>
                <textarea
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={submit} disabled={loading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {loading ? '保存中...' : '保存'}
                </button>
                <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-4 py-2 border border-gray-200 rounded-lg" />
    </div>
  )
}

function ProcessTemplateManager({ onMessage }: { onMessage: (msg: string) => void }) {
  const [templates, setTemplates] = useState<ProcessTemplate[]>([])
  const [materials, setMaterials] = useState<Array<{ id: string; code: string; name: string }>>([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ProcessTemplate | null>(null)
  const emptyForm = () => ({ code: '', name: '', category: 'SAWING', defaultTime: 0, workstation: '', description: '', materialIds: [] as string[], standardBatchQty: 1000, setupTimeMinutes: 0, cycleTimeSeconds: 0, peopleCount: 1, laborRatePerHour: 0, machineCount: 1, machineRatePerHour: 0, energyCostPerHour: 0, consumableCostPerBatch: 0, yieldRate: 100 })
  const [form, setForm] = useState(emptyForm())

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
    <div className="rounded-lg bg-white p-6 shadow">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-lg font-semibold">加工工艺</h3><p className="mt-1 text-sm text-gray-500">按类别维护可复用工艺，并关联到物料全景。</p></div>
        <button onClick={openAdd} className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700">新增</button>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {templates.map((template) => {
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
      </div>
      {showModal && <div className="fixed inset-0 z-50 flex items-center justify-center mes-modal-overlay p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-4 flex justify-between"><h3 className="text-lg font-semibold">{editing ? '编辑加工工艺' : '新增加工工艺'}</h3><button onClick={() => setShowModal(false)} className="text-xl text-gray-400">×</button></div>
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
        <div className="mt-5 flex justify-end gap-2"><button onClick={() => setShowModal(false)} className="rounded-lg border px-4 py-2 text-sm">取消</button><button onClick={submit} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">保存</button></div>
      </div></div>}
    </div>
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
  const routeSort = useClientTableSort(routes, {
    material: (route) => `${displayMaterialCode(route.product?.sku)} ${route.product?.name || ''}`,
    name: (route) => route.name,
    default: (route) => route.isDefault,
    steps: (route) => route.steps.length,
  }, 'material', 'asc')

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
    <div className="rounded-lg bg-white p-4 shadow sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">BOM/工艺</h3>
          <p className="text-sm text-gray-500 mt-1">维护物料工艺路线和工序。已产生派工或报工的工序不建议直接修改。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <div className="hidden lg:block">
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>
          <button onClick={openAdd} className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 sm:w-auto">
            新增工艺路线
          </button>
        </div>
      </div>

      {effectiveViewMode === 'card' && routes.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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

      {routes.length === 0 && <div className="text-center py-12 text-gray-500">暂无工艺路线</div>}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center mes-modal-overlay p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">{editingRoute ? '编辑工艺路线' : '新增工艺路线'}</h3>
              <button onClick={() => { setShowModal(false); resetForm() }} className="text-gray-500 hover:text-gray-700">&times;</button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
                    新增工序
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
                      <div className="grid grid-cols-4 gap-3">
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

              <div className="flex gap-3 pt-2">
                <button onClick={submit} disabled={loading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {loading ? '保存中...' : '保存'}
                </button>
                <button onClick={() => { setShowModal(false); resetForm() }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
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
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">归档记录</h3>
          <p className="text-sm text-gray-500 mt-1">归档记录可以恢复；没有有效库存和下游业务引用时可永久删除并释放编码，完整红冲且净影响为零的来料历史会一并清理。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <div className="hidden lg:block">
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>
          <button onClick={fetchDeletedRecords} className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 sm:w-auto">
            刷新
          </button>
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
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">操作记录</h3>
          <p className="text-sm text-gray-500 mt-1">记录新增、修改、归档、恢复、收货、盘点等关键操作。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <div className="hidden lg:block">
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>
          <button onClick={fetchLogs} className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 sm:w-auto">
            刷新
          </button>
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
