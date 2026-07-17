'use client'

import { useEffect, useMemo, useState } from 'react'

interface ProductOption {
  id: string
  sku: string
  name: string
  unit: string
  bom?: { id: string; version: string; isActive: boolean } | null
}

interface BomCostLine {
  id: string
  lineType: string
  sourceId?: string | null
  code?: string | null
  name: string
  quantity: number
  unit: string
  unitCost: number
  materialCost: number
  laborHours: number
  machineHours: number
  laborCost: number
  machineCost: number
  directCost: number
  totalCost: number
  note?: string | null
}

interface BomCostRun {
  id: string
  productId: string
  bomVersion?: string | null
  quantityBasis: number
  laborRatePerHour: number
  machineRatePerHour: number
  overheadCost: number
  totalMaterialCost: number
  totalLaborCost: number
  totalMachineCost: number
  totalDirectCost: number
  totalCost: number
  unitCost: number
  createdBy?: string | null
  createdAt: string
  product?: { id: string; sku: string; name: string; unit: string }
  lines: BomCostLine[]
}

interface CostObjectItem {
  id: string
  code: string
  name: string
  objectType: string
  sourceType?: string | null
  unit: string
  status: string
  createdAt: string
  costs: Array<{
    id: string
    version: string
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
    bom: { id: string; version: string; product: { id: string; sku: string; name: string; unit: string } }
  }>
}

interface ProcessTemplateItem {
  id: string
  code: string
  name: string
  category: string
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
  materials: Array<{ id: string; code: string; name: string }>
}

interface CostDataProduct {
  id: string
  sku: string
  name: string
  unit: string
  bom?: {
    id: string
    version: string
    isActive: boolean
    items: Array<{
      id: string
      itemType: string
      quantity: number
      unit: string
      wastageRate: number
      material?: { id: string; code: string; name: string; stockUnit: string; valuationUnit: string } | null
      costObject?: { id: string; code: string; name: string; objectType: string; unit: string } | null
      sawingScenario?: { id: string; name: string } | null
    }>
  } | null
  processRoutes: Array<{
    id: string
    name: string
    isDefault: boolean
    steps: Array<{
      id: string
      stepNo: number
      name: string
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
  }>
  bomCostRuns: Array<{ id: string; unitCost: number; totalCost: number; quantityBasis: number; createdAt: string }>
}

interface CostData {
  costObjects: CostObjectItem[]
  processTemplates: ProcessTemplateItem[]
  products: CostDataProduct[]
  recentRuns: BomCostRun[]
}

const lineTypeLabels: Record<string, string> = {
  BOM_MATERIAL: '物料',
  BOM_COST_OBJECT: '成本对象',
  OVERHEAD: '固定费用',
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

function money(value: number) {
  return `¥${Number(value || 0).toFixed(2)}`
}

function qty(value: number, digits = 3) {
  return Number(value || 0).toFixed(digits).replace(/\.?0+$/, '')
}

function dateText(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function processCostPerThousand(item: {
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

function NumberField({ label, value, unit, onChange }: { label: string; value: number; unit: string; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-blue-500">
        <input
          type="number"
          min="0"
          step="any"
          value={value || ''}
          onChange={(event) => onChange(Math.max(0, Number(event.target.value)))}
          className="min-w-0 flex-1 px-3 py-2 text-sm outline-none"
        />
        <span className="flex items-center border-l border-gray-200 bg-gray-50 px-3 text-sm text-gray-500">{unit}</span>
      </div>
    </label>
  )
}

function SummaryCard({ label, value, hint, primary = false }: { label: string; value: string; hint?: string; primary?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${primary ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'}`}>
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${primary ? 'text-blue-700' : 'text-gray-900'}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  )
}

function ProductSearchSelect({
  value,
  products,
  onChange,
}: {
  value: string
  products: ProductOption[]
  onChange: (value: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selected = products.find((product) => product.id === value)
  const filtered = products.filter((product) => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return true
    return `${product.sku} ${product.name}`.toLowerCase().includes(keyword)
  }).slice(0, 30)

  return (
    <div className="relative">
      <input
        value={open ? query : (selected ? `${selected.sku} · ${selected.name}` : query)}
        onFocus={() => {
          setOpen(true)
          if (selected && !query) setQuery(`${selected.sku} ${selected.name}`)
        }}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
          if (value) onChange('')
        }}
        placeholder="输入产品编码或名称"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">没有匹配产品</div>
          ) : (
            filtered.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => {
                  onChange(product.id)
                  setQuery('')
                  setOpen(false)
                }}
                className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50 ${value === product.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span>
                    <span className="font-mono text-xs text-gray-500">{product.sku}</span>
                    <span className="ml-2">{product.name}</span>
                  </span>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${product.bom ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {product.bom ? product.bom.version : '无BOM'}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function BomCostPage({ onMessage }: { onMessage: (msg: string) => void }) {
  const [activeTab, setActiveTab] = useState<'calculate' | 'data'>('calculate')
  const [products, setProducts] = useState<ProductOption[]>([])
  const [runs, setRuns] = useState<BomCostRun[]>([])
  const [costData, setCostData] = useState<CostData | null>(null)
  const [costKeyword, setCostKeyword] = useState('')
  const [savingCostObject, setSavingCostObject] = useState(false)
  const [costObjectForm, setCostObjectForm] = useState({
    code: '',
    name: '',
    objectType: 'MANUAL',
    unit: '件',
    materialCostPerUnit: 0,
    laborHoursPerUnit: 0,
    machineHoursPerUnit: 0,
    directCostPerUnit: 0,
  })
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedRun, setSelectedRun] = useState<BomCostRun | null>(null)
  const [loading, setLoading] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [form, setForm] = useState({
    quantityBasis: 1000,
    laborRatePerHour: 28,
    machineRatePerHour: 35,
    overheadCost: 0,
  })
  const selectedProduct = products.find((product) => product.id === selectedProductId)
  const displayedRun = selectedRun || runs[0] || null

  const loadData = async (productId = selectedProductId) => {
    setLoading(true)
    try {
      const url = productId ? `/api/bom-costs?productId=${encodeURIComponent(productId)}` : '/api/bom-costs'
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '获取 BOM 成本数据失败')
        return
      }
      setProducts(data.products || [])
      setRuns(data.runs || [])
      setSelectedRun((current) => {
        if (current && (!productId || current.productId === productId) && (data.runs || []).some((run: BomCostRun) => run.id === current.id)) return current
        return (data.runs || [])[0] || null
      })
    } catch (error) {
      onMessage('获取 BOM 成本数据失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData('')
    loadCostData()
  }, [])

  const loadCostData = async () => {
    try {
      const res = await fetch('/api/cost-objects')
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '获取成本数据失败')
        return
      }
      setCostData(data)
    } catch (error) {
      onMessage('获取成本数据失败')
    }
  }

  const selectProduct = async (productId: string) => {
    setSelectedProductId(productId)
    setSelectedRun(null)
    await loadData(productId)
  }

  const calculate = async () => {
    if (!selectedProductId) return onMessage('请选择产品')
    setCalculating(true)
    try {
      const res = await fetch('/api/bom-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: selectedProductId, ...form }),
      })
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || 'BOM 成本计算失败')
        return
      }
      onMessage('BOM 成本快照已保存')
      setSelectedRun(data.data)
      await loadData(selectedProductId)
    } catch (error) {
      onMessage('BOM 成本计算失败')
    } finally {
      setCalculating(false)
    }
  }

  const saveCostObject = async () => {
    if (!costObjectForm.code.trim() || !costObjectForm.name.trim()) return onMessage('成本对象编码和名称必填')
    setSavingCostObject(true)
    try {
      const res = await fetch('/api/cost-objects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(costObjectForm),
      })
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '保存成本对象失败')
        return
      }
      setCostObjectForm({
        code: '',
        name: '',
        objectType: 'MANUAL',
        unit: '件',
        materialCostPerUnit: 0,
        laborHoursPerUnit: 0,
        machineHoursPerUnit: 0,
        directCostPerUnit: 0,
      })
      onMessage('成本对象已保存')
      await loadCostData()
    } catch (error) {
      onMessage('保存成本对象失败')
    } finally {
      setSavingCostObject(false)
    }
  }

  const runStats = useMemo(() => {
    const run = displayedRun
    if (!run) return null
    const overhead = Number(run.overheadCost || 0)
    return {
      overhead,
      processCost: Number(run.totalLaborCost || 0) + Number(run.totalMachineCost || 0) + Number(run.totalDirectCost || 0),
      basisText: `${qty(run.quantityBasis, 2)} ${run.product?.unit || selectedProduct?.unit || '件'}`,
    }
  }, [displayedRun, selectedProduct])

  const filteredCostObjects = (costData?.costObjects || []).filter((item) => `${item.code} ${item.name} ${item.objectType}`.toLowerCase().includes(costKeyword.trim().toLowerCase()))
  const filteredProcessTemplates = (costData?.processTemplates || []).filter((item) => `${item.code} ${item.name} ${item.category} ${item.materials.map((material) => material.code).join(' ')}`.toLowerCase().includes(costKeyword.trim().toLowerCase()))
  const filteredCostProducts = (costData?.products || []).filter((item) => `${item.sku} ${item.name}`.toLowerCase().includes(costKeyword.trim().toLowerCase()))

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">BOM 成本计算</h2>
            <div className="mt-1 text-sm text-gray-500">成本快照 · 物料成本 · 成本对象</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {([
              ['calculate', '成本计算'],
              ['data', '成本数据'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${activeTab === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {label}
              </button>
            ))}
            {activeTab === 'calculate' && (
              <button
                onClick={calculate}
                disabled={calculating || !selectedProductId}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {calculating ? '计算中...' : '计算并保存'}
              </button>
            )}
          </div>
        </div>
      </div>

      {activeTab === 'data' && (
        <div className="space-y-4">
          <div className="rounded-lg bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">成本数据检查</h3>
                <div className="mt-1 text-sm text-gray-500">零件成本对象、BOM 组成、可计算工艺和最近成本快照</div>
              </div>
              <input
                value={costKeyword}
                onChange={(event) => setCostKeyword(event.target.value)}
                placeholder="搜索编码、名称、物料或产品"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm lg:w-80"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="rounded-lg bg-white p-5 shadow-sm">
                <h3 className="mb-4 font-semibold text-gray-900">新增手工成本对象</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <label className="text-sm text-gray-700">编码<input value={costObjectForm.code} onChange={(event) => setCostObjectForm((current) => ({ ...current, code: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" placeholder="如 COST-PACK-001" /></label>
                  <label className="text-sm text-gray-700">名称<input value={costObjectForm.name} onChange={(event) => setCostObjectForm((current) => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" placeholder="如 包装人工" /></label>
                  <label className="text-sm text-gray-700">类型<input value={costObjectForm.objectType} onChange={(event) => setCostObjectForm((current) => ({ ...current, objectType: event.target.value || 'MANUAL' }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" /></label>
                  <label className="text-sm text-gray-700">单位<input value={costObjectForm.unit} onChange={(event) => setCostObjectForm((current) => ({ ...current, unit: event.target.value || '件' }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" /></label>
                  <NumberField label="单位材料成本" value={costObjectForm.materialCostPerUnit} unit="元/单位" onChange={(value) => setCostObjectForm((current) => ({ ...current, materialCostPerUnit: value }))} />
                  <NumberField label="单位人工工时" value={costObjectForm.laborHoursPerUnit} unit="小时/单位" onChange={(value) => setCostObjectForm((current) => ({ ...current, laborHoursPerUnit: value }))} />
                  <NumberField label="单位机时" value={costObjectForm.machineHoursPerUnit} unit="小时/单位" onChange={(value) => setCostObjectForm((current) => ({ ...current, machineHoursPerUnit: value }))} />
                  <NumberField label="其他直接费用" value={costObjectForm.directCostPerUnit} unit="元/单位" onChange={(value) => setCostObjectForm((current) => ({ ...current, directCostPerUnit: value }))} />
                </div>
                <button onClick={saveCostObject} disabled={savingCostObject} className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{savingCostObject ? '保存中...' : '保存成本对象'}</button>
              </div>

              <div className="rounded-lg bg-white p-5 shadow-sm">
                <h3 className="mb-4 font-semibold text-gray-900">最近 BOM 成本</h3>
                {(costData?.recentRuns || []).length === 0 ? <div className="rounded-lg border border-dashed p-6 text-sm text-gray-500">暂无成本快照</div> : (
                  <div className="space-y-2">
                    {(costData?.recentRuns || []).map((run) => (
                      <div key={run.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div><div className="font-medium text-gray-900">{run.product ? `${run.product.sku} ${run.product.name}` : 'BOM成本'}</div><div className="mt-1 text-xs text-gray-500">{dateText(run.createdAt)} · {qty(run.quantityBasis, 2)} {run.product?.unit || '件'}</div></div>
                          <div className="text-right"><div className="font-semibold text-blue-700">{money(run.unitCost)}</div><div className="mt-1 text-xs text-gray-500">单位成本</div></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SummaryCard label="成本对象" value={`${costData?.costObjects.length || 0}`} hint="可加入 BOM 的非库存成本" primary />
                <SummaryCard label="加工工艺" value={`${costData?.processTemplates.length || 0}`} hint="可计算工时机时模板" />
                <SummaryCard label="有 BOM 产品" value={`${(costData?.products || []).filter((item) => item.bom).length}`} hint="可进行 BOM 成本计算" />
              </div>

              <div className="rounded-lg bg-white p-5 shadow-sm">
                <h3 className="mb-4 font-semibold text-gray-900">成本对象</h3>
                {filteredCostObjects.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-sm text-gray-500">暂无成本对象</div> : (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {filteredCostObjects.map((item) => {
                      const activeCost = item.costs[0]
                      return (
                        <div key={item.id} className="rounded-lg border border-gray-200 p-4">
                          <div className="flex items-start justify-between gap-3"><div><div className="font-medium text-gray-900">{item.name}</div><div className="mt-1 font-mono text-xs text-blue-700">{item.code} · {item.objectType}</div></div><span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{item.unit}</span></div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                            <span>材料 <b>{money(activeCost?.materialCostPerUnit || 0)}</b></span>
                            <span>直接费 <b>{money(activeCost?.directCostPerUnit || 0)}</b></span>
                            <span>人工时 <b>{qty(activeCost?.laborHoursPerUnit || 0, 4)} h</b></span>
                            <span>机时 <b>{qty(activeCost?.machineHoursPerUnit || 0, 4)} h</b></span>
                          </div>
                          <div className="mt-3 text-xs text-gray-500">BOM 使用：{item.bomItems.length ? item.bomItems.map((bomItem) => bomItem.bom.product.sku).join('、') : '暂无'}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-lg bg-white p-5 shadow-sm">
                <h3 className="mb-4 font-semibold text-gray-900">可计算工艺</h3>
                {filteredProcessTemplates.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-sm text-gray-500">暂无加工工艺</div> : (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {filteredProcessTemplates.map((template) => {
                      const totals = processCostPerThousand(template)
                      return (
                        <div key={template.id} className="rounded-lg border border-gray-200 p-4">
                          <div className="flex items-start justify-between gap-3"><div><div className="font-medium text-gray-900">{template.name}</div><div className="mt-1 font-mono text-xs text-blue-700">{template.code}</div></div><span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">{processCategoryLabels[template.category] || template.category}</span></div>
                          <div className="mt-3 grid grid-cols-3 gap-2 rounded bg-blue-50 p-2 text-xs text-blue-800"><span>千件人工<br /><b>{qty(totals.laborHours, 2)} h</b></span><span>千件机时<br /><b>{qty(totals.machineHours, 2)} h</b></span><span>千件成本<br /><b>{money(totals.cost)}</b></span></div>
                          <div className="mt-3 text-xs text-gray-500">关联物料：{template.materials.length ? template.materials.map((material) => material.code).join('、') : '暂无'}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-lg bg-white p-5 shadow-sm">
                <h3 className="mb-4 font-semibold text-gray-900">产品 BOM 与工序</h3>
                <div className="space-y-3">
                  {filteredCostProducts.slice(0, 30).map((product) => {
                    const latestCost = product.bomCostRuns[0]
                    const routeSteps = product.processRoutes.flatMap((route) => route.steps)
                    const routeCost = routeSteps.reduce((sum, step) => {
                      const totals = processCostPerThousand(step)
                      return { labor: sum.labor + totals.laborHours, machine: sum.machine + totals.machineHours, cost: sum.cost + totals.cost }
                    }, { labor: 0, machine: 0, cost: 0 })
                    return (
                      <div key={product.id} className="rounded-lg border border-gray-200 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div><div className="font-medium text-gray-900">{product.name}</div><div className="mt-1 font-mono text-xs text-blue-700">{product.sku}</div></div>
                          <div className="text-right text-xs text-gray-500">{latestCost ? `最新单位成本 ${money(latestCost.unitCost)}` : '暂无成本快照'}</div>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-gray-600">
                          <span>BOM 项 <b>{product.bom?.items.length || 0}</b></span>
                          <span>工序 <b>{routeSteps.length}</b></span>
                          <span>千件路线成本 <b>{money(routeCost.cost)}</b></span>
                        </div>
                        {product.bom && <div className="mt-3 flex flex-wrap gap-2 text-xs">{product.bom.items.slice(0, 8).map((item) => <span key={item.id} className="rounded bg-gray-100 px-2 py-1 text-gray-700">{item.material ? item.material.code : item.costObject ? item.costObject.code : item.sawingScenario?.name || item.itemType}</span>)}</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'calculate' && (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-lg bg-white p-5 shadow-sm">
            <h3 className="mb-4 font-semibold text-gray-900">产品</h3>
            <ProductSearchSelect value={selectedProductId} products={products} onChange={selectProduct} />
            {selectedProduct && (
              <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
                <div className="font-medium text-gray-900">{selectedProduct.name}</div>
                <div className="mt-1 text-xs text-gray-500">{selectedProduct.sku} · {selectedProduct.unit} · {selectedProduct.bom ? selectedProduct.bom.version : '无BOM'}</div>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-white p-5 shadow-sm">
            <h3 className="mb-4 font-semibold text-gray-900">计算参数</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <NumberField label="数量基准" value={form.quantityBasis} unit={selectedProduct?.unit || '件'} onChange={(value) => setForm((current) => ({ ...current, quantityBasis: value || 1 }))} />
              <NumberField label="人工小时费率" value={form.laborRatePerHour} unit="元/小时" onChange={(value) => setForm((current) => ({ ...current, laborRatePerHour: value }))} />
              <NumberField label="机时费率" value={form.machineRatePerHour} unit="元/小时" onChange={(value) => setForm((current) => ({ ...current, machineRatePerHour: value }))} />
              <NumberField label="固定费用分摊" value={form.overheadCost} unit="元/次" onChange={(value) => setForm((current) => ({ ...current, overheadCost: value }))} />
            </div>
          </div>

          <div className="rounded-lg bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">历史快照</h3>
              {loading && <span className="text-xs text-gray-500">加载中...</span>}
            </div>
            {runs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">暂无成本快照</div>
            ) : (
              <div className="space-y-2">
                {runs.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => setSelectedRun(run)}
                    className={`block w-full rounded-lg border p-3 text-left text-sm ${displayedRun?.id === run.id ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-gray-900">{run.product ? `${run.product.sku} ${run.product.name}` : 'BOM成本快照'}</div>
                        <div className="mt-1 text-xs text-gray-500">{dateText(run.createdAt)} · {qty(run.quantityBasis, 2)} {run.product?.unit || '件'}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-blue-700">{money(run.unitCost)}</div>
                        <div className="mt-1 text-xs text-gray-500">单位成本</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {!displayedRun ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">选择产品后计算 BOM 成本</div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="单位成本" value={money(displayedRun.unitCost)} hint={runStats?.basisText} primary />
                <SummaryCard label="总成本" value={money(displayedRun.totalCost)} hint={`BOM ${displayedRun.bomVersion || 'v1'}`} primary />
                <SummaryCard label="材料成本" value={money(displayedRun.totalMaterialCost)} hint="库存单价" />
                <SummaryCard label="加工成本" value={money(runStats?.processCost || 0)} hint={`人工 ${money(displayedRun.totalLaborCost)} · 机时 ${money(displayedRun.totalMachineCost)}`} />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SummaryCard label="人工工时" value={`${qty(displayedRun.lines.reduce((sum, line) => sum + Number(line.laborHours || 0), 0), 3)} h`} />
                <SummaryCard label="机时" value={`${qty(displayedRun.lines.reduce((sum, line) => sum + Number(line.machineHours || 0), 0), 3)} h`} />
                <SummaryCard label="固定费用" value={money(runStats?.overhead || 0)} hint="本次快照分摊" />
              </div>

              <div className="rounded-lg bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
                  <h3 className="font-semibold text-gray-900">成本明细</h3>
                  <div className="text-xs text-gray-500">{dateText(displayedRun.createdAt)}{displayedRun.createdBy ? ` · ${displayedRun.createdBy}` : ''}</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1040px] text-sm">
                    <thead className="bg-gray-50 text-left text-gray-600">
                      <tr>
                        <th className="px-3 py-2">类型</th>
                        <th className="px-3 py-2">编码</th>
                        <th className="px-3 py-2">名称</th>
                        <th className="px-3 py-2 text-right">数量</th>
                        <th className="px-3 py-2 text-right">单位成本</th>
                        <th className="px-3 py-2 text-right">材料</th>
                        <th className="px-3 py-2 text-right">人工时</th>
                        <th className="px-3 py-2 text-right">机时</th>
                        <th className="px-3 py-2 text-right">人工</th>
                        <th className="px-3 py-2 text-right">机时费</th>
                        <th className="px-3 py-2 text-right">直接费</th>
                        <th className="px-3 py-2 text-right">合计</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {displayedRun.lines.map((line) => (
                        <tr key={line.id} className="align-top hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">{lineTypeLabels[line.lineType] || line.lineType}</span>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-500">{line.code || '-'}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-900">{line.name}</div>
                            {line.note && <div className="mt-1 text-xs text-gray-500">{line.note}</div>}
                          </td>
                          <td className="px-3 py-2 text-right">{qty(line.quantity, 3)} {line.unit}</td>
                          <td className="px-3 py-2 text-right">{money(line.unitCost)}</td>
                          <td className="px-3 py-2 text-right">{money(line.materialCost)}</td>
                          <td className="px-3 py-2 text-right">{qty(line.laborHours, 4)}</td>
                          <td className="px-3 py-2 text-right">{qty(line.machineHours, 4)}</td>
                          <td className="px-3 py-2 text-right">{money(line.laborCost)}</td>
                          <td className="px-3 py-2 text-right">{money(line.machineCost)}</td>
                          <td className="px-3 py-2 text-right">{money(line.directCost)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">{money(line.totalCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      )}
    </div>
  )
}
