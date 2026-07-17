'use client'

import { useEffect, useMemo, useState } from 'react'

interface ProcessOption { id: string; code: string; name: string; category: string }
interface ProductOption { id: string; sku: string; name: string; unit: string }
interface SavedScenario {
  id: string
  name: string
  quantity: number
  utilization: number
  materialCostPerPiece: number
  totalRevenue: number
  totalProfit: number
  grossMargin: number
  bladeThickness: number
  finishedPrice: number
  laborCost: number
  fullCost: number
  fullProfit: number
  fullMargin: number
  productKind: 'EXISTING' | 'TEMPORARY'
  laborHoursPerPiece: number
  machineHoursPerPiece: number
  product?: ProductOption | null
  bomItems?: Array<{ bom: { product: { id: string; sku: string; name: string } } }>
  processTemplates: ProcessOption[]
}

interface MixRow {
  id: string
  name: string
  quantity: number
  sellingPrice: number
  materialCostPerPiece: number
  laborHoursPerPiece: number
  machineHoursPerPiece: number
}

function NumberField({ label, value, unit, onChange }: { label: string; value: number; unit: string; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-blue-500">
        <input type="number" min="0" step="any" value={value || ''} onChange={(event) => onChange(Number(event.target.value))} className="min-w-0 flex-1 px-3 py-2 outline-none" />
        <span className="flex items-center border-l border-gray-200 bg-gray-50 px-3 text-sm text-gray-500">{unit}</span>
      </div>
    </label>
  )
}

function ResultCard({ label, value, hint, primary = false }: { label: string; value: string; hint?: string; primary?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${primary ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'}`}>
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${primary ? 'text-blue-700' : 'text-gray-900'}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  )
}

function SaveProductCostPanel({
  scenarioName,
  setScenarioName,
  productKind,
  setProductKind,
  selectedProductId,
  setSelectedProductId,
  bomProductId,
  setBomProductId,
  productOptions,
  processOptions,
  selectedProcessIds,
  setSelectedProcessIds,
  saving,
  onSave,
}: {
  scenarioName: string
  setScenarioName: (value: string) => void
  productKind: 'TEMPORARY' | 'EXISTING'
  setProductKind: (value: 'TEMPORARY' | 'EXISTING') => void
  selectedProductId: string
  setSelectedProductId: (value: string) => void
  bomProductId: string
  setBomProductId: (value: string) => void
  productOptions: ProductOption[]
  processOptions: ProcessOption[]
  selectedProcessIds: string[]
  setSelectedProcessIds: (value: string[]) => void
  saving: boolean
  onSave: () => void
}) {
  return (
    <div className="rounded-lg bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-gray-900">保存为产品成本对象</h3>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <input value={scenarioName} onChange={(event) => setScenarioName(event.target.value)} placeholder="产品成本名称" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        <button onClick={onSave} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? '保存中...' : '保存成本对象'}</button>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
        <select value={productKind} onChange={(event) => setProductKind(event.target.value as 'TEMPORARY' | 'EXISTING')} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <option value="TEMPORARY">保存为临时产品</option>
          <option value="EXISTING">绑定已有产品</option>
        </select>
        {productKind === 'EXISTING' ? (
          <select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <option value="">选择产品</option>
            {productOptions.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}
          </select>
        ) : (
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-500">临时产品会保留单件材料成本、人工时和机时，后续可直接加入混合测算。</div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-600">BOM 组成</div>
        <select value={bomProductId} onChange={(event) => setBomProductId(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <option value="">不加入产品 BOM</option>
          {productOptions.map((product) => <option key={product.id} value={product.id}>加入 {product.sku} · {product.name} 的 BOM</option>)}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">{processOptions.map((process) => <label key={process.id} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs ${selectedProcessIds.includes(process.id) ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}><input type="checkbox" className="mr-1.5" checked={selectedProcessIds.includes(process.id)} onChange={(event) => setSelectedProcessIds(event.target.checked ? [...selectedProcessIds, process.id] : selectedProcessIds.filter((id) => id !== process.id))} />{process.name}</label>)}</div>
    </div>
  )
}

export default function SawingCostCalculatorPage() {
  const [form, setForm] = useState({
    materialLength: 6000,
    materialWeight: 48,
    workpieceLength: 250,
    bladeThickness: 2.5,
    rawMaterialPrice: 6.8,
    sawdustPrice: 0.8,
    scrapPrice: 3.2,
    finishedPrice: 18,
  })
  const [shiftForm, setShiftForm] = useState({
    workerCount: 2,
    shiftHours: 8,
    laborRatePerHour: 28,
    piecesPerLaborHour: 10,
    machineCount: 1,
    machineRatePerHour: 35,
  })
  const [scaleForm, setScaleForm] = useState({
    plannedShifts: 20,
    machineHoursPerShift: 8,
    otherCost: 0,
  })
  const [mixRows, setMixRows] = useState<MixRow[]>([])
  const [scenarioName, setScenarioName] = useState('')
  const [productKind, setProductKind] = useState<'TEMPORARY' | 'EXISTING'>('TEMPORARY')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [bomProductId, setBomProductId] = useState('')
  const [processOptions, setProcessOptions] = useState<ProcessOption[]>([])
  const [productOptions, setProductOptions] = useState<ProductOption[]>([])
  const [selectedProcessIds, setSelectedProcessIds] = useState<string[]>([])
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([])
  const [comparisonIds, setComparisonIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [activeStep, setActiveStep] = useState(1)

  const money = (value: number) => `¥${value.toFixed(2)}`
  const weight = (value: number) => `${value.toFixed(3)} kg`
  const update = (key: keyof typeof form, value: number) => setForm((current) => ({ ...current, [key]: Math.max(0, value) }))
  const updateShift = (key: keyof typeof shiftForm, value: number) => setShiftForm((current) => ({ ...current, [key]: Math.max(0, value) }))
  const updateScale = (key: keyof typeof scaleForm, value: number) => setScaleForm((current) => ({ ...current, [key]: Math.max(0, value) }))

  const loadScenarios = async () => {
    const res = await fetch('/api/sawing-cost-scenarios')
    const data = await res.json()
    if (res.ok) {
      setSavedScenarios(data.data || [])
      setProcessOptions(data.processTemplates || [])
      setProductOptions(data.products || [])
    } else setMessage(data.error || '获取已保存方案失败')
  }

  useEffect(() => { loadScenarios() }, [])

  const materialResult = useMemo(() => {
    const { materialLength, materialWeight, workpieceLength, bladeThickness, rawMaterialPrice, sawdustPrice, scrapPrice, finishedPrice } = form
    const valid = materialLength > 0 && materialWeight > 0 && workpieceLength > 0 && workpieceLength + bladeThickness > 0
    const quantity = valid ? Math.floor((materialLength + bladeThickness) / (workpieceLength + bladeThickness)) : 0
    const productLength = quantity * workpieceLength
    const kerfLength = quantity * bladeThickness
    const remainderLength = Math.max(0, materialLength - productLength - kerfLength)
    const weightPerLength = valid ? materialWeight / materialLength : 0
    const productWeight = productLength * weightPerLength
    const sawdustWeight = kerfLength * weightPerLength
    const scrapWeight = remainderLength * weightPerLength
    const rawCost = materialWeight * rawMaterialPrice
    const sawdustRecovery = sawdustWeight * sawdustPrice
    const scrapRecovery = scrapWeight * scrapPrice
    const netMaterialCost = Math.max(0, rawCost - sawdustRecovery - scrapRecovery)
    const materialCostPerPiece = quantity > 0 ? netMaterialCost / quantity : 0
    const totalRevenue = quantity * finishedPrice
    const totalProfit = totalRevenue - netMaterialCost
    const grossMargin = totalRevenue > 0 ? totalProfit / totalRevenue * 100 : 0
    const utilization = materialWeight > 0 ? productWeight / materialWeight * 100 : 0
    const profitPerPiece = finishedPrice - materialCostPerPiece
    return { quantity, productLength, kerfLength, remainderLength, productWeight, sawdustWeight, scrapWeight, rawCost, sawdustRecovery, scrapRecovery, netMaterialCost, materialCostPerPiece, profitPerPiece, totalRevenue, totalProfit, grossMargin, utilization }
  }, [form])

  const shiftResult = useMemo(() => {
    const laborHours = shiftForm.workerCount * shiftForm.shiftHours
    const quantity = laborHours * shiftForm.piecesPerLaborHour
    const revenue = quantity * form.finishedPrice
    const materialCost = quantity * materialResult.materialCostPerPiece
    const laborCost = laborHours * shiftForm.laborRatePerHour
    const machineHours = shiftForm.machineCount * shiftForm.shiftHours
    const machineCost = machineHours * shiftForm.machineRatePerHour
    const totalCost = materialCost + laborCost + machineCost
    const profit = revenue - totalCost
    const margin = revenue > 0 ? profit / revenue * 100 : 0
    return { laborHours, quantity, revenue, materialCost, laborCost, machineHours, machineCost, totalCost, profit, margin }
  }, [form.finishedPrice, materialResult.materialCostPerPiece, shiftForm])

  useEffect(() => {
    setMixRows((current) => {
      if (current.length > 0) return current
      return [{
        id: `mix-${Date.now()}`,
        name: '当前锯切产品',
        quantity: Math.max(0, Math.round(shiftResult.quantity * 20)),
        sellingPrice: form.finishedPrice,
        materialCostPerPiece: materialResult.materialCostPerPiece,
        laborHoursPerPiece: shiftForm.piecesPerLaborHour > 0 ? 1 / shiftForm.piecesPerLaborHour : 0,
        machineHoursPerPiece: shiftResult.quantity > 0 ? shiftResult.machineHours / shiftResult.quantity : 0,
      }]
    })
  }, [form.finishedPrice, materialResult.materialCostPerPiece, shiftForm.piecesPerLaborHour, shiftResult.machineHours, shiftResult.quantity])

  const scaleResult = useMemo(() => {
    const totalRevenue = mixRows.reduce((sum, row) => sum + row.quantity * row.sellingPrice, 0)
    const materialCost = mixRows.reduce((sum, row) => sum + row.quantity * row.materialCostPerPiece, 0)
    const laborHours = mixRows.reduce((sum, row) => sum + row.quantity * row.laborHoursPerPiece, 0)
    const machineHours = mixRows.reduce((sum, row) => sum + row.quantity * row.machineHoursPerPiece, 0)
    const laborCost = laborHours * shiftForm.laborRatePerHour
    const machineCost = machineHours * shiftForm.machineRatePerHour
    const totalCost = materialCost + laborCost + machineCost + scaleForm.otherCost
    const profit = totalRevenue - totalCost
    const margin = totalRevenue > 0 ? profit / totalRevenue * 100 : 0
    const laborCapacity = shiftForm.workerCount * shiftForm.shiftHours * scaleForm.plannedShifts
    const machineCapacity = shiftForm.machineCount * scaleForm.machineHoursPerShift * scaleForm.plannedShifts
    const laborLoad = laborCapacity > 0 ? laborHours / laborCapacity * 100 : 0
    const machineLoad = machineCapacity > 0 ? machineHours / machineCapacity * 100 : 0
    const requiredShifts = Math.max(
      laborCapacity > 0 ? laborHours / (shiftForm.workerCount * shiftForm.shiftHours || 1) : 0,
      machineCapacity > 0 ? machineHours / (shiftForm.machineCount * scaleForm.machineHoursPerShift || 1) : 0,
    )
    return { totalRevenue, materialCost, laborHours, machineHours, laborCost, machineCost, totalCost, profit, margin, laborCapacity, machineCapacity, laborLoad, machineLoad, requiredShifts }
  }, [mixRows, scaleForm, shiftForm])

  const patchMixRow = (id: string, values: Partial<MixRow>) => setMixRows((rows) => rows.map((row) => row.id === id ? { ...row, ...values } : row))
  const addMixRow = () => setMixRows((rows) => [...rows, { id: `mix-${Date.now()}-${rows.length}`, name: `产品 ${rows.length + 1}`, quantity: 0, sellingPrice: 0, materialCostPerPiece: 0, laborHoursPerPiece: 0, machineHoursPerPiece: 0 }])
  const addScenarioToMix = (scenario: SavedScenario) => setMixRows((rows) => [...rows, {
    id: `mix-scenario-${scenario.id}-${Date.now()}`,
    name: scenario.product ? `${scenario.product.sku} ${scenario.product.name}` : scenario.name,
    quantity: Math.max(0, scenario.quantity),
    sellingPrice: scenario.finishedPrice,
    materialCostPerPiece: scenario.materialCostPerPiece,
    laborHoursPerPiece: scenario.laborHoursPerPiece,
    machineHoursPerPiece: scenario.machineHoursPerPiece,
  }])
  const currentProductMixRow = (): MixRow => ({
    id: `mix-${Date.now()}`,
    name: '当前锯切产品',
    quantity: Math.max(0, Math.round(shiftResult.quantity * scaleForm.plannedShifts)),
    sellingPrice: form.finishedPrice,
    materialCostPerPiece: materialResult.materialCostPerPiece,
    laborHoursPerPiece: shiftForm.piecesPerLaborHour > 0 ? 1 / shiftForm.piecesPerLaborHour : 0,
    machineHoursPerPiece: shiftResult.quantity > 0 ? shiftResult.machineHours / shiftResult.quantity : 0,
  })
  const syncCurrentProduct = () => setMixRows((rows) => {
    const next = currentProductMixRow()
    const index = rows.findIndex((row) => row.name === '当前锯切产品')
    if (index < 0) return [next, ...rows]
    return rows.map((row, rowIndex) => rowIndex === index ? { ...next, id: row.id } : row)
  })
  const comparedScenarios = savedScenarios.filter((scenario) => comparisonIds.includes(scenario.id))

  const saveScenario = async () => {
    if (!scenarioName.trim()) return setMessage('请先填写方案名称')
    if (productKind === 'EXISTING' && !selectedProductId) return setMessage('请选择要绑定的产品')
    if (materialResult.quantity <= 0) return setMessage('当前参数无法加工出成品')
    setSaving(true)
    const payload = {
      ...form,
      ...materialResult,
      name: scenarioName.trim(),
      productKind,
      productId: productKind === 'EXISTING' ? selectedProductId : undefined,
      bomProductId: bomProductId || undefined,
      laborHoursPerPiece: shiftForm.piecesPerLaborHour > 0 ? 1 / shiftForm.piecesPerLaborHour : 0,
      machineHoursPerPiece: shiftResult.quantity > 0 ? shiftResult.machineHours / shiftResult.quantity : 0,
      processTemplateIds: selectedProcessIds,
      additionalDirectCost: 0,
      laborCost: scaleResult.laborCost,
      fixedCost: scaleResult.machineCost + scaleForm.otherCost,
      directStageCost: scaleResult.materialCost,
      manufacturingCost: scaleResult.materialCost + scaleResult.laborCost,
      fullCost: scaleResult.totalCost,
      directProfit: scaleResult.totalRevenue - scaleResult.materialCost,
      manufacturingProfit: scaleResult.totalRevenue - scaleResult.materialCost - scaleResult.laborCost,
      fullProfit: scaleResult.profit,
      directMargin: scaleResult.totalRevenue > 0 ? (scaleResult.totalRevenue - scaleResult.materialCost) / scaleResult.totalRevenue * 100 : 0,
      manufacturingMargin: scaleResult.totalRevenue > 0 ? (scaleResult.totalRevenue - scaleResult.materialCost - scaleResult.laborCost) / scaleResult.totalRevenue * 100 : 0,
      fullMargin: scaleResult.margin,
      costItems: [
        { stage: 'LABOR', name: '规模测算人工工时', method: 'LABOR_HOURS', inputA: 1, inputB: scaleResult.laborHours, inputC: shiftForm.laborRatePerHour, amount: scaleResult.laborCost, isDeduction: false, sortOrder: 0 },
        { stage: 'FIXED', name: '规模测算机时费用', method: 'LABOR_HOURS', inputA: 1, inputB: scaleResult.machineHours, inputC: shiftForm.machineRatePerHour, amount: scaleResult.machineCost, isDeduction: false, sortOrder: 1 },
        { stage: 'FIXED', name: '其他期间费用', method: 'MANUAL', inputA: scaleForm.otherCost, inputB: 0, inputC: 0, amount: scaleForm.otherCost, isDeduction: false, sortOrder: 2 },
      ],
    }
    const res = await fetch('/api/sawing-cost-scenarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) return setMessage(data.error || '保存方案失败')
    setScenarioName('')
    setMessage('方案已保存，可在下方勾选对比')
    await loadScenarios()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold text-gray-900">锯切费用计算</h2>
          <span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">三步经营测算</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
          {['材料成本', '班次收入', '混合规模'].map((label, index) => (
            <button key={label} onClick={() => setActiveStep(index + 1)} className={`min-w-0 rounded-md px-2 py-2 text-xs font-medium sm:text-sm ${activeStep === index + 1 ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
              <span className="hidden sm:inline">{index + 1}. </span>{label}
            </button>
          ))}
        </div>
      </div>

      {message && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{message}</div>}

      {activeStep === 1 && <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold text-gray-900">材料与售价</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <NumberField label="材料长度" value={form.materialLength} unit="mm" onChange={(value) => update('materialLength', value)} />
            <NumberField label="材料总重量" value={form.materialWeight} unit="kg" onChange={(value) => update('materialWeight', value)} />
            <NumberField label="工件长度" value={form.workpieceLength} unit="mm" onChange={(value) => update('workpieceLength', value)} />
            <NumberField label="锯片厚度 / 锯缝" value={form.bladeThickness} unit="mm" onChange={(value) => update('bladeThickness', value)} />
            <NumberField label="原材料单价" value={form.rawMaterialPrice} unit="元/kg" onChange={(value) => update('rawMaterialPrice', value)} />
            <NumberField label="废屑回收单价" value={form.sawdustPrice} unit="元/kg" onChange={(value) => update('sawdustPrice', value)} />
            <NumberField label="剩余废料单价" value={form.scrapPrice} unit="元/kg" onChange={(value) => update('scrapPrice', value)} />
            <NumberField label="销售单价" value={form.finishedPrice} unit="元/件" onChange={(value) => update('finishedPrice', value)} />
          </div>
        </div>
        <div className="space-y-4">
          {materialResult.quantity === 0 ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">当前材料长度不足以切出一件成品，请检查材料、工件长度和锯片厚度。</div> : <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ResultCard label="可加工数量" value={`${materialResult.quantity} 件`} hint={`每件占用 ${(form.workpieceLength + form.bladeThickness).toFixed(2)} mm`} primary />
              <ResultCard label="材料利用率" value={`${materialResult.utilization.toFixed(2)}%`} hint="成品重量 ÷ 材料总重量" primary />
              <ResultCard label="单件材料成本" value={money(materialResult.materialCostPerPiece)} hint="扣除废屑和边料回收" />
              <ResultCard label="单件材料毛利" value={money(materialResult.profitPerPiece)} hint={`销售单价 ${money(form.finishedPrice)}`} primary />
            </div>
            <div className="rounded-lg bg-white p-5 shadow-sm">
              <h3 className="mb-3 font-semibold text-gray-900">材料成本拆解</h3>
              <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
                <ResultCard label="成品用料" value={weight(materialResult.productWeight)} hint={`${materialResult.productLength.toFixed(2)} mm`} />
                <ResultCard label="锯缝废屑" value={weight(materialResult.sawdustWeight)} hint={`${materialResult.kerfLength.toFixed(2)} mm`} />
                <ResultCard label="剩余边料" value={weight(materialResult.scrapWeight)} hint={`${materialResult.remainderLength.toFixed(2)} mm`} />
                <ResultCard label="整根材料毛利" value={money(materialResult.totalProfit)} hint={`毛利率 ${materialResult.grossMargin.toFixed(2)}%`} />
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-600">原材料总成本</span><span>{money(materialResult.rawCost)}</span></div>
                <div className="flex justify-between text-emerald-700"><span>减：废屑回收价值</span><span>-{money(materialResult.sawdustRecovery)}</span></div>
                <div className="flex justify-between text-emerald-700"><span>减：剩余边料回收价值</span><span>-{money(materialResult.scrapRecovery)}</span></div>
                <div className="flex justify-between border-t pt-2 font-semibold"><span>净材料成本</span><span>{money(materialResult.netMaterialCost)}</span></div>
              </div>
            </div>
            <SaveProductCostPanel
              scenarioName={scenarioName}
              setScenarioName={setScenarioName}
              productKind={productKind}
              setProductKind={setProductKind}
              selectedProductId={selectedProductId}
              setSelectedProductId={setSelectedProductId}
              bomProductId={bomProductId}
              setBomProductId={setBomProductId}
              productOptions={productOptions}
              processOptions={processOptions}
              selectedProcessIds={selectedProcessIds}
              setSelectedProcessIds={setSelectedProcessIds}
              saving={saving}
              onSave={saveScenario}
            />
          </>}
        </div>
      </div>}

      {activeStep === 2 && <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold text-gray-900">班次产能参数</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <NumberField label="班次人数" value={shiftForm.workerCount} unit="人" onChange={(value) => updateShift('workerCount', value)} />
            <NumberField label="每班时长" value={shiftForm.shiftHours} unit="小时" onChange={(value) => updateShift('shiftHours', value)} />
            <NumberField label="人工小时成本" value={shiftForm.laborRatePerHour} unit="元/小时" onChange={(value) => updateShift('laborRatePerHour', value)} />
            <NumberField label="生产效率" value={shiftForm.piecesPerLaborHour} unit="件/人工时" onChange={(value) => updateShift('piecesPerLaborHour', value)} />
            <NumberField label="设备数量" value={shiftForm.machineCount} unit="台" onChange={(value) => updateShift('machineCount', value)} />
            <NumberField label="机时成本" value={shiftForm.machineRatePerHour} unit="元/小时" onChange={(value) => updateShift('machineRatePerHour', value)} />
          </div>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ResultCard label="每班产量" value={`${shiftResult.quantity.toFixed(0)} 件`} hint={`${shiftResult.laborHours.toFixed(2)} 人工时`} primary />
            <ResultCard label="每班营业收入" value={money(shiftResult.revenue)} hint={`${money(form.finishedPrice)} / 件`} primary />
            <ResultCard label="每班总成本" value={money(shiftResult.totalCost)} hint={`材料 ${money(shiftResult.materialCost)}`} />
            <ResultCard label="每班经营利润" value={money(shiftResult.profit)} hint={`利润率 ${shiftResult.margin.toFixed(2)}%`} primary />
          </div>
          <div className="rounded-lg bg-white p-5 shadow-sm">
            <h3 className="mb-3 font-semibold text-gray-900">班次收入拆解</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">销售收入</span><span>{money(shiftResult.revenue)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">材料成本</span><span>-{money(shiftResult.materialCost)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">人工成本</span><span>-{money(shiftResult.laborCost)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">机时费用</span><span>-{money(shiftResult.machineCost)}</span></div>
              <div className="flex justify-between border-t pt-2 font-semibold text-blue-700"><span>单班经营利润</span><span>{money(shiftResult.profit)}</span></div>
            </div>
          </div>
        </div>
      </div>}

      {activeStep === 3 && <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="rounded-lg bg-white p-5 shadow-sm">
            <h3 className="mb-4 font-semibold text-gray-900">规模跨度</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <NumberField label="计划班次数" value={scaleForm.plannedShifts} unit="班" onChange={(value) => updateScale('plannedShifts', value)} />
              <NumberField label="每台每班机时" value={scaleForm.machineHoursPerShift} unit="小时" onChange={(value) => updateScale('machineHoursPerShift', value)} />
              <NumberField label="其他期间费用" value={scaleForm.otherCost} unit="元" onChange={(value) => updateScale('otherCost', value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ResultCard label="规模营业收入" value={money(scaleResult.totalRevenue)} hint={`${mixRows.length} 个产品组合`} primary />
            <ResultCard label="规模总成本" value={money(scaleResult.totalCost)} hint={`材料 ${money(scaleResult.materialCost)}`} />
            <ResultCard label="规模经营利润" value={money(scaleResult.profit)} hint={`利润率 ${scaleResult.margin.toFixed(2)}%`} primary />
            <ResultCard label="所需班次" value={`${scaleResult.requiredShifts.toFixed(1)} 班`} hint={`人工负荷 ${scaleResult.laborLoad.toFixed(1)}% · 机时负荷 ${scaleResult.machineLoad.toFixed(1)}%`} />
          </div>
        </div>

        <div className="rounded-lg bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-gray-900">混合产品工时机时</h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={syncCurrentProduct} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700">同步当前产品</button>
              <button onClick={addMixRow} className="rounded-lg border border-blue-300 px-3 py-1.5 text-sm text-blue-700">新增产品</button>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[940px] text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-3 py-2">产品</th>
                  <th className="px-3 py-2 text-right">数量</th>
                  <th className="px-3 py-2 text-right">售价</th>
                  <th className="px-3 py-2 text-right">材料成本/件</th>
                  <th className="px-3 py-2 text-right">人工时/件</th>
                  <th className="px-3 py-2 text-right">机时/件</th>
                  <th className="px-3 py-2 text-right">收入</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {mixRows.map((row) => <tr key={row.id}>
                  <td className="px-3 py-2"><input value={row.name} onChange={(event) => patchMixRow(row.id, { name: event.target.value })} className="w-full rounded border border-gray-200 px-2 py-1" /></td>
                  <td className="px-3 py-2"><input type="number" min="0" value={row.quantity || ''} onChange={(event) => patchMixRow(row.id, { quantity: Math.max(0, Number(event.target.value)) })} className="w-full rounded border border-gray-200 px-2 py-1 text-right" /></td>
                  <td className="px-3 py-2"><input type="number" min="0" value={row.sellingPrice || ''} onChange={(event) => patchMixRow(row.id, { sellingPrice: Math.max(0, Number(event.target.value)) })} className="w-full rounded border border-gray-200 px-2 py-1 text-right" /></td>
                  <td className="px-3 py-2"><input type="number" min="0" value={row.materialCostPerPiece || ''} onChange={(event) => patchMixRow(row.id, { materialCostPerPiece: Math.max(0, Number(event.target.value)) })} className="w-full rounded border border-gray-200 px-2 py-1 text-right" /></td>
                  <td className="px-3 py-2"><input type="number" min="0" step="any" value={row.laborHoursPerPiece || ''} onChange={(event) => patchMixRow(row.id, { laborHoursPerPiece: Math.max(0, Number(event.target.value)) })} className="w-full rounded border border-gray-200 px-2 py-1 text-right" /></td>
                  <td className="px-3 py-2"><input type="number" min="0" step="any" value={row.machineHoursPerPiece || ''} onChange={(event) => patchMixRow(row.id, { machineHoursPerPiece: Math.max(0, Number(event.target.value)) })} className="w-full rounded border border-gray-200 px-2 py-1 text-right" /></td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">{money(row.quantity * row.sellingPrice)}</td>
                  <td className="px-3 py-2 text-right"><button onClick={() => setMixRows((rows) => rows.filter((item) => item.id !== row.id))} className="rounded border border-red-200 px-2 py-1 text-xs text-red-600">移除</button></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="rounded bg-gray-50 p-3">人工需求 <b>{scaleResult.laborHours.toFixed(2)} h</b></div>
            <div className="rounded bg-gray-50 p-3">人工产能 <b>{scaleResult.laborCapacity.toFixed(2)} h</b></div>
            <div className="rounded bg-gray-50 p-3">机时需求 <b>{scaleResult.machineHours.toFixed(2)} h</b></div>
            <div className="rounded bg-gray-50 p-3">机时产能 <b>{scaleResult.machineCapacity.toFixed(2)} h</b></div>
          </div>
        </div>

        <SaveProductCostPanel
          scenarioName={scenarioName}
          setScenarioName={setScenarioName}
          productKind={productKind}
          setProductKind={setProductKind}
          selectedProductId={selectedProductId}
          setSelectedProductId={setSelectedProductId}
          bomProductId={bomProductId}
          setBomProductId={setBomProductId}
          productOptions={productOptions}
          processOptions={processOptions}
          selectedProcessIds={selectedProcessIds}
          setSelectedProcessIds={setSelectedProcessIds}
          saving={saving}
          onSave={saveScenario}
        />

        <div className="rounded-lg bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900">调用已保存产品成本</h3>
          {savedScenarios.length === 0 ? <div className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">暂无可调用的产品成本</div> : (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {savedScenarios.map((scenario) => <div key={scenario.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-gray-900">{scenario.product ? `${scenario.product.sku} ${scenario.product.name}` : scenario.name}</div>
                    <div className="mt-1 text-xs text-gray-500">{scenario.productKind === 'EXISTING' ? '已有产品' : '临时产品'} · {scenario.quantity} 件/根</div>
                    {scenario.bomItems && scenario.bomItems.length > 0 && <div className="mt-1 text-xs text-blue-700">BOM：{scenario.bomItems.map((item) => item.bom.product.name).join('、')}</div>}
                  </div>
                  <button onClick={() => addScenarioToMix(scenario)} className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs text-blue-700">加入</button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-gray-600">
                  <span>材料<br /><b>{money(scenario.materialCostPerPiece)}</b></span>
                  <span>人工时<br /><b>{scenario.laborHoursPerPiece.toFixed(4)}</b></span>
                  <span>机时<br /><b>{scenario.machineHoursPerPiece.toFixed(4)}</b></span>
                </div>
              </div>)}
            </div>
          )}
        </div>

        <div className="rounded-lg bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900">已保存方案对比</h3>
          {savedScenarios.length === 0 ? <div className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">暂无已保存方案</div> : <>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{savedScenarios.map((scenario) => <label key={scenario.id} className={`cursor-pointer rounded-lg border p-4 ${comparisonIds.includes(scenario.id) ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}><div className="flex items-start gap-2"><input type="checkbox" checked={comparisonIds.includes(scenario.id)} onChange={(event) => setComparisonIds(event.target.checked ? [...comparisonIds, scenario.id] : comparisonIds.filter((id) => id !== scenario.id))} /><div><div className="font-medium text-gray-900">{scenario.name}</div><div className="mt-1 text-xs text-gray-500">{scenario.processTemplates.map((item) => item.name).join(' + ') || '仅锯切'}</div><div className="mt-2 text-xs text-gray-600">{scenario.quantity} 件 · 利用率 {scenario.utilization.toFixed(2)}% · 总收入 {money(scenario.totalRevenue)}</div><div className="mt-1 text-xs font-medium text-blue-700">经营利润 {money(scenario.fullProfit)} · {scenario.fullMargin.toFixed(2)}%</div></div></div></label>)}</div>
            {comparedScenarios.length >= 2 && <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">指标</th>{comparedScenarios.map((item) => <th key={item.id} className="px-3 py-2 text-right">{item.name}</th>)}</tr></thead><tbody className="divide-y">{[
              ['锯片厚度', (item: SavedScenario) => `${item.bladeThickness.toFixed(2)} mm`],
              ['可加工数量', (item: SavedScenario) => `${item.quantity} 件`],
              ['材料利用率', (item: SavedScenario) => `${item.utilization.toFixed(2)}%`],
              ['单件材料成本', (item: SavedScenario) => money(item.materialCostPerPiece)],
              ['营业收入', (item: SavedScenario) => money(item.totalRevenue)],
              ['人工费用', (item: SavedScenario) => money(item.laborCost)],
              ['总成本', (item: SavedScenario) => money(item.fullCost)],
              ['经营利润', (item: SavedScenario) => money(item.fullProfit)],
              ['经营利润率', (item: SavedScenario) => `${item.fullMargin.toFixed(2)}%`],
            ].map(([label, formatter]) => <tr key={label as string}><td className="px-3 py-2 font-medium text-gray-600">{label as string}</td>{comparedScenarios.map((item) => <td key={item.id} className="px-3 py-2 text-right">{(formatter as (value: SavedScenario) => string)(item)}</td>)}</tr>)}</tbody></table></div>}
          </>}
        </div>
      </div>}

      <div className="sticky bottom-20 z-10 flex items-center justify-between rounded-lg border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur lg:bottom-3">
        <button onClick={() => setActiveStep((step) => Math.max(1, step - 1))} disabled={activeStep === 1} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 disabled:opacity-30">上一步</button>
        <div className="text-center text-xs text-gray-500"><span className="font-semibold text-gray-900">{activeStep} / 3</span><span className="hidden sm:inline"> · 当前规模收入 {money(scaleResult.totalRevenue)}</span></div>
        <button onClick={() => setActiveStep((step) => Math.min(3, step + 1))} disabled={activeStep === 3} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-30">下一步</button>
      </div>
    </div>
  )
}
