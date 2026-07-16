'use client'

import { useEffect, useMemo, useState } from 'react'

interface ProcessOption { id: string; code: string; name: string; category: string }
interface SavedScenario {
  id: string; name: string; quantity: number; utilization: number; materialCostPerPiece: number; profitPerPiece: number; totalProfit: number; grossMargin: number; bladeThickness: number; finishedPrice: number; createdAt: string
  additionalDirectCost: number; laborCost: number; fixedCost: number; directStageCost: number; manufacturingCost: number; fullCost: number; directProfit: number; manufacturingProfit: number; fullProfit: number; directMargin: number; manufacturingMargin: number; fullMargin: number
  processTemplates: ProcessOption[]
}

type CostStage = 'DIRECT' | 'LABOR' | 'FIXED'
type CostMethod = 'MANUAL' | 'QUANTITY' | 'LABOR_HOURS' | 'LABOR_PIECE' | 'TURNOVER'
interface CostItem { id: string; stage: CostStage; name: string; method: CostMethod; inputA: number; inputB: number; inputC: number; isDeduction: boolean; note: string }

const stageMeta: Record<CostStage, { title: string; description: string }> = {
  DIRECT: { title: '第一阶段：基础费用', description: '直接材料、耗材、能源、外协与回收抵扣' },
  LABOR: { title: '第二阶段：人员费用', description: '按人数、工时、费率或合格产量计算' },
  FIXED: { title: '第三阶段：固定费用', description: '厂房租金、设备折旧和管理费用按周转量分摊' },
}

function itemAmount(item: CostItem) {
  if (item.method === 'LABOR_HOURS') return item.inputA * item.inputB * item.inputC
  if (item.method === 'QUANTITY' || item.method === 'LABOR_PIECE') return item.inputA * item.inputB
  if (item.method === 'TURNOVER') return item.inputB > 0 ? item.inputA / item.inputB * item.inputC : 0
  return item.inputA
}

function CostStageEditor({ stage, items, onChange }: { stage: CostStage; items: CostItem[]; onChange: (items: CostItem[]) => void }) {
  const methods: Array<[CostMethod, string]> = stage === 'DIRECT'
    ? [['MANUAL', '直接金额'], ['QUANTITY', '数量 × 单价']]
    : stage === 'LABOR'
      ? [['LABOR_HOURS', '人数 × 工时 × 费率'], ['LABOR_PIECE', '产量 × 计件单价'], ['MANUAL', '直接金额']]
      : [['TURNOVER', '周期费用 ÷ 周期周转量 × 本方案占用量'], ['MANUAL', '直接金额']]
  const add = () => onChange([...items, { id: `cost-${Date.now()}-${items.length}`, stage, name: '', method: methods[0][0], inputA: 0, inputB: 0, inputC: 0, isDeduction: false, note: '' }])
  const patch = (id: string, values: Partial<CostItem>) => onChange(items.map((item) => item.id === id ? { ...item, ...values } : item))
  return <div className="rounded-lg bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-gray-900">{stageMeta[stage].title}</h3><p className="mt-1 text-xs text-gray-500">{stageMeta[stage].description}</p></div><button onClick={add} className="rounded-lg border border-blue-300 px-3 py-1.5 text-sm text-blue-700">新增费用项</button></div>
    {items.length === 0 ? <div className="mt-4 rounded-lg border border-dashed p-4 text-center text-sm text-gray-400">暂无自定义费用</div> : <div className="mt-4 space-y-3">{items.map((item) => <div key={item.id} className="rounded-lg border border-gray-200 p-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(140px,1fr)_minmax(180px,1.2fr)_auto]">
        <input value={item.name} onChange={(event) => patch(item.id, { name: event.target.value })} placeholder="费用名称" className="rounded border border-gray-200 px-3 py-2 text-sm" />
        <select value={item.method} onChange={(event) => patch(item.id, { method: event.target.value as CostMethod, inputA: 0, inputB: 0, inputC: 0 })} className="rounded border border-gray-200 px-3 py-2 text-sm">{methods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <button onClick={() => onChange(items.filter((row) => row.id !== item.id))} className="rounded border border-red-200 px-3 py-2 text-xs text-red-600">移除</button>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(item.method === 'MANUAL') && <NumberField label="金额" value={item.inputA} unit="元" onChange={(value) => patch(item.id, { inputA: value })} />}
        {(item.method === 'QUANTITY' || item.method === 'LABOR_PIECE') && <><NumberField label={item.method === 'LABOR_PIECE' ? '计件数量' : '数量'} value={item.inputA} unit="份" onChange={(value) => patch(item.id, { inputA: value })} /><NumberField label="单价" value={item.inputB} unit="元/份" onChange={(value) => patch(item.id, { inputB: value })} /></>}
        {item.method === 'LABOR_HOURS' && <><NumberField label="人数" value={item.inputA} unit="人" onChange={(value) => patch(item.id, { inputA: value })} /><NumberField label="每人工时" value={item.inputB} unit="小时" onChange={(value) => patch(item.id, { inputB: value })} /><NumberField label="小时费率" value={item.inputC} unit="元/小时" onChange={(value) => patch(item.id, { inputC: value })} /></>}
        {item.method === 'TURNOVER' && <><NumberField label="周期费用" value={item.inputA} unit="元" onChange={(value) => patch(item.id, { inputA: value })} /><NumberField label="周期周转量" value={item.inputB} unit="单位" onChange={(value) => patch(item.id, { inputB: value })} /><NumberField label="本方案占用量" value={item.inputC} unit="单位" onChange={(value) => patch(item.id, { inputC: value })} /></>}
      </div>
      <div className="mt-2 flex items-center justify-between"><label className={`text-xs ${stage === 'DIRECT' ? 'text-gray-600' : 'invisible'}`}><input type="checkbox" checked={item.isDeduction} onChange={(event) => patch(item.id, { isDeduction: event.target.checked })} className="mr-1" />作为回收/抵扣</label><div className="font-semibold text-gray-900">{item.isDeduction ? '-' : ''}¥{itemAmount(item).toFixed(2)}</div></div>
    </div>)}</div>}
  </div>
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
  const [scenarioName, setScenarioName] = useState('')
  const [processOptions, setProcessOptions] = useState<ProcessOption[]>([])
  const [selectedProcessIds, setSelectedProcessIds] = useState<string[]>([])
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([])
  const [comparisonIds, setComparisonIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [costItems, setCostItems] = useState<CostItem[]>([])
  const [activeStep, setActiveStep] = useState(1)

  const loadScenarios = async () => {
    const res = await fetch('/api/sawing-cost-scenarios')
    const data = await res.json()
    if (res.ok) {
      setSavedScenarios(data.data || [])
      setProcessOptions(data.processTemplates || [])
    } else setMessage(data.error || '获取已保存方案失败')
  }

  useEffect(() => { loadScenarios() }, [])

  const result = useMemo(() => {
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
    const profitPerPiece = finishedPrice - materialCostPerPiece
    const totalRevenue = quantity * finishedPrice
    const totalProfit = totalRevenue - netMaterialCost
    const grossMargin = totalRevenue > 0 ? totalProfit / totalRevenue * 100 : 0
    const utilization = materialWeight > 0 ? productWeight / materialWeight * 100 : 0
    return { quantity, productLength, kerfLength, remainderLength, productWeight, sawdustWeight, scrapWeight, rawCost, sawdustRecovery, scrapRecovery, netMaterialCost, materialCostPerPiece, profitPerPiece, totalRevenue, totalProfit, grossMargin, utilization }
  }, [form])

  const update = (key: keyof typeof form, value: number) => setForm((current) => ({ ...current, [key]: Math.max(0, value) }))
  const money = (value: number) => `¥${value.toFixed(2)}`
  const weight = (value: number) => `${value.toFixed(3)} kg`
  const comparedScenarios = savedScenarios.filter((scenario) => comparisonIds.includes(scenario.id))
  const stageResult = useMemo(() => {
    const stageTotal = (stage: CostStage) => costItems.filter((item) => item.stage === stage).reduce((sum, item) => sum + itemAmount(item) * (item.isDeduction ? -1 : 1), 0)
    const additionalDirectCost = stageTotal('DIRECT')
    const laborCost = stageTotal('LABOR')
    const fixedCost = stageTotal('FIXED')
    const directStageCost = Math.max(0, result.netMaterialCost + additionalDirectCost)
    const manufacturingCost = directStageCost + laborCost
    const fullCost = manufacturingCost + fixedCost
    const directProfit = result.totalRevenue - directStageCost
    const manufacturingProfit = result.totalRevenue - manufacturingCost
    const fullProfit = result.totalRevenue - fullCost
    const margin = (profit: number) => result.totalRevenue > 0 ? profit / result.totalRevenue * 100 : 0
    return { additionalDirectCost, laborCost, fixedCost, directStageCost, manufacturingCost, fullCost, directProfit, manufacturingProfit, fullProfit, directMargin: margin(directProfit), manufacturingMargin: margin(manufacturingProfit), fullMargin: margin(fullProfit) }
  }, [costItems, result.netMaterialCost, result.totalRevenue])

  const saveScenario = async () => {
    if (!scenarioName.trim()) return setMessage('请先填写方案名称')
    if (result.quantity <= 0) return setMessage('当前参数无法加工出成品')
    setSaving(true)
    const res = await fetch('/api/sawing-cost-scenarios', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, ...result, ...stageResult, name: scenarioName.trim(), processTemplateIds: selectedProcessIds, costItems: costItems.filter((item) => item.name.trim()).map((item, index) => ({ stage: item.stage, name: item.name.trim(), method: item.method, inputA: item.inputA, inputB: item.inputB, inputC: item.inputC, amount: itemAmount(item) * (item.isDeduction ? -1 : 1), isDeduction: item.isDeduction, note: item.note || undefined, sortOrder: index })) }),
    })
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
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold text-gray-900">生产成本试算</h2><span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">分步填写</span></div>
        <p className="mt-1 text-sm text-gray-500">按顺序填写，不需要一次看完所有费用。</p>
        <div className="mt-4 grid grid-cols-5 gap-1 rounded-lg bg-gray-100 p-1">
          {['材料与售价', '直接费用', '人员费用', '固定费用', '结果'].map((label, index) => <button key={label} onClick={() => setActiveStep(index + 1)} className={`min-w-0 rounded-md px-2 py-2 text-xs font-medium sm:text-sm ${activeStep === index + 1 ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}><span className="hidden sm:inline">{index + 1}. </span>{label}</button>)}
        </div>
      </div>

      {activeStep >= 2 && activeStep <= 4 && (() => { const stage = (['DIRECT', 'LABOR', 'FIXED'] as CostStage[])[activeStep - 2]; return <CostStageEditor stage={stage} items={costItems.filter((item) => item.stage === stage)} onChange={(items) => setCostItems((current) => [...current.filter((item) => item.stage !== stage), ...items])} /> })()}

      {activeStep === 5 && <div className="rounded-lg bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900">三阶段成本与利润</h3>
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <ResultCard label="基础直接成本" value={money(stageResult.directStageCost)} hint={`直接利润 ${money(stageResult.directProfit)} · ${stageResult.directMargin.toFixed(2)}%`} primary />
          <ResultCard label="加人人员后制造成本" value={money(stageResult.manufacturingCost)} hint={`制造利润 ${money(stageResult.manufacturingProfit)} · ${stageResult.manufacturingMargin.toFixed(2)}%`} primary />
          <ResultCard label="合并完整生产成本" value={money(stageResult.fullCost)} hint={`完整利润 ${money(stageResult.fullProfit)} · ${stageResult.fullMargin.toFixed(2)}%`} primary />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"><div className="rounded bg-gray-50 p-3">净材料 {money(result.netMaterialCost)}</div><div className="rounded bg-gray-50 p-3">其他直接 {money(stageResult.additionalDirectCost)}</div><div className="rounded bg-gray-50 p-3">人员 {money(stageResult.laborCost)}</div><div className="rounded bg-gray-50 p-3">固定分摊 {money(stageResult.fixedCost)}</div></div>
      </div>}

      {message && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{message}</div>}

      {activeStep === 1 && <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold text-gray-900">计算参数</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <NumberField label="材料长度" value={form.materialLength} unit="mm" onChange={(value) => update('materialLength', value)} />
            <NumberField label="材料总重量" value={form.materialWeight} unit="kg" onChange={(value) => update('materialWeight', value)} />
            <NumberField label="工件长度" value={form.workpieceLength} unit="mm" onChange={(value) => update('workpieceLength', value)} />
            <NumberField label="锯片厚度 / 锯缝" value={form.bladeThickness} unit="mm" onChange={(value) => update('bladeThickness', value)} />
            <NumberField label="原材料单价" value={form.rawMaterialPrice} unit="元/kg" onChange={(value) => update('rawMaterialPrice', value)} />
            <NumberField label="废屑回收单价" value={form.sawdustPrice} unit="元/kg" onChange={(value) => update('sawdustPrice', value)} />
            <NumberField label="剩余废料单价" value={form.scrapPrice} unit="元/kg" onChange={(value) => update('scrapPrice', value)} />
            <NumberField label="成品价格" value={form.finishedPrice} unit="元/件" onChange={(value) => update('finishedPrice', value)} />
          </div>
        </div>

        <div className="space-y-4">
          {result.quantity === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">当前材料长度不足以切出一件成品，请检查材料、工件长度和锯片厚度。</div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <ResultCard label="可加工数量" value={`${result.quantity} 件`} hint={`每件占用 ${(form.workpieceLength + form.bladeThickness).toFixed(2)} mm`} primary />
                <ResultCard label="材料利用率" value={`${result.utilization.toFixed(2)}%`} hint="成品重量 ÷ 材料总重量" primary />
                <ResultCard label="单件净材料成本" value={money(result.materialCostPerPiece)} hint="已扣除废屑和边料回收价值" />
                <ResultCard label="单件材料毛利" value={money(result.profitPerPiece)} hint={`成品价格 ${money(form.finishedPrice)}`} primary />
              </div>

              {false && <div className="rounded-lg bg-white p-5 shadow-sm">
                <h3 className="mb-4 font-semibold text-gray-900">材料分配</h3>
                <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
                  <ResultCard label="成品用料" value={weight(result.productWeight)} hint={`${result.productLength.toFixed(2)} mm`} />
                  <ResultCard label="锯缝废屑" value={weight(result.sawdustWeight)} hint={`${result.kerfLength.toFixed(2)} mm`} />
                  <ResultCard label="剩余边料" value={weight(result.scrapWeight)} hint={`${result.remainderLength.toFixed(2)} mm`} />
                  <ResultCard label="整根材料总毛利" value={money(result.totalProfit)} hint={`毛利率 ${result.grossMargin.toFixed(2)}%`} />
                </div>
              </div>}

              <div className="rounded-lg bg-white p-5 shadow-sm">
                <h3 className="mb-3 font-semibold text-gray-900">成本拆解</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-600">原材料总成本</span><span>{money(result.rawCost)}</span></div>
                  <div className="flex justify-between text-emerald-700"><span>减：废屑回收价值</span><span>-{money(result.sawdustRecovery)}</span></div>
                  <div className="flex justify-between text-emerald-700"><span>减：剩余边料回收价值</span><span>-{money(result.scrapRecovery)}</span></div>
                  <div className="flex justify-between border-t pt-2 font-semibold"><span>净材料成本</span><span>{money(result.netMaterialCost)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">成品销售收入</span><span>{money(result.totalRevenue)}</span></div>
                  <div className="flex justify-between border-t pt-2 font-semibold text-blue-700"><span>材料毛利</span><span>{money(result.totalProfit)}</span></div>
                </div>
                <p className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">这里只显示材料试算。点击“下一步”继续填写其他直接费用、人员费用和固定费用。</p>
              </div>
            </>
          )}
        </div>
      </div>}

      {activeStep === 5 && <div className="rounded-lg bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900">保存这次试算</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]"><input value={scenarioName} onChange={(event) => setScenarioName(event.target.value)} placeholder="方案名称" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" /><button onClick={saveScenario} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? '保存中...' : '保存方案'}</button></div>
        <div className="mt-3 flex flex-wrap gap-2">{processOptions.map((process) => <label key={process.id} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs ${selectedProcessIds.includes(process.id) ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}><input type="checkbox" className="mr-1.5" checked={selectedProcessIds.includes(process.id)} onChange={(event) => setSelectedProcessIds(event.target.checked ? [...selectedProcessIds, process.id] : selectedProcessIds.filter((id) => id !== process.id))} />{process.name}</label>)}</div>
      </div>}

      {activeStep === 5 && <div className="rounded-lg bg-white p-5 shadow-sm">
        <div><h3 className="font-semibold text-gray-900">已保存方案与组合对比</h3><p className="mt-1 text-xs text-gray-500">勾选 2 个以上方案，对比不同锯缝和生产工艺组合。</p></div>
        {savedScenarios.length === 0 ? <div className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">暂无已保存方案</div> : <>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{savedScenarios.map((scenario) => <label key={scenario.id} className={`cursor-pointer rounded-lg border p-4 ${comparisonIds.includes(scenario.id) ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}><div className="flex items-start gap-2"><input type="checkbox" checked={comparisonIds.includes(scenario.id)} onChange={(event) => setComparisonIds(event.target.checked ? [...comparisonIds, scenario.id] : comparisonIds.filter((id) => id !== scenario.id))} /><div><div className="font-medium text-gray-900">{scenario.name}</div><div className="mt-1 text-xs text-gray-500">{scenario.processTemplates.map((item) => item.name).join(' + ') || '仅锯切'}</div><div className="mt-2 text-xs text-gray-600">{scenario.quantity} 件 · 利用率 {scenario.utilization.toFixed(2)}% · 完整成本 {money(scenario.fullCost)}</div><div className="mt-1 text-xs font-medium text-blue-700">完整利润 {money(scenario.fullProfit)} · {scenario.fullMargin.toFixed(2)}%</div></div></div></label>)}</div>
          {comparedScenarios.length >= 2 && <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">指标</th>{comparedScenarios.map((item) => <th key={item.id} className="px-3 py-2 text-right">{item.name}</th>)}</tr></thead><tbody className="divide-y">{[
            ['工艺组合', (item: SavedScenario) => item.processTemplates.map((p) => p.name).join(' + ') || '仅锯切'],
            ['锯片厚度', (item: SavedScenario) => `${item.bladeThickness.toFixed(2)} mm`], ['可加工数量', (item: SavedScenario) => `${item.quantity} 件`], ['材料利用率', (item: SavedScenario) => `${item.utilization.toFixed(2)}%`],
            ['基础直接成本', (item: SavedScenario) => money(item.directStageCost)], ['人员费用', (item: SavedScenario) => money(item.laborCost)], ['固定费用分摊', (item: SavedScenario) => money(item.fixedCost)], ['合并完整成本', (item: SavedScenario) => money(item.fullCost)], ['直接利润率', (item: SavedScenario) => `${item.directMargin.toFixed(2)}%`], ['制造利润率', (item: SavedScenario) => `${item.manufacturingMargin.toFixed(2)}%`], ['完整利润', (item: SavedScenario) => money(item.fullProfit)], ['完整利润率', (item: SavedScenario) => `${item.fullMargin.toFixed(2)}%`],
          ].map(([label, formatter]) => <tr key={label as string}><td className="px-3 py-2 font-medium text-gray-600">{label as string}</td>{comparedScenarios.map((item) => <td key={item.id} className="px-3 py-2 text-right">{(formatter as (value: SavedScenario) => string)(item)}</td>)}</tr>)}</tbody></table></div>}
        </>}
      </div>}

      <div className="sticky bottom-20 z-10 flex items-center justify-between rounded-lg border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur lg:bottom-3">
        <button onClick={() => setActiveStep((step) => Math.max(1, step - 1))} disabled={activeStep === 1} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 disabled:opacity-30">上一步</button>
        <div className="text-center text-xs text-gray-500"><span className="font-semibold text-gray-900">{activeStep} / 5</span><span className="hidden sm:inline"> · 当前完整成本 {money(stageResult.fullCost)}</span></div>
        <button onClick={() => setActiveStep((step) => Math.min(5, step + 1))} disabled={activeStep === 5} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-30">下一步</button>
      </div>
    </div>
  )
}
