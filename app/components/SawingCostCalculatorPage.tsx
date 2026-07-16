'use client'

import { useMemo, useState } from 'react'

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

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold text-gray-900">锯切加工成本计算器</h2><span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">第一阶段 · 材料口径</span></div>
        <p className="mt-1 text-sm text-gray-500">按材料线密度计算。每切一件消耗一个锯片厚度，锯屑和剩余边料分别按回收价冲减成本。</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
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

              <div className="rounded-lg bg-white p-5 shadow-sm">
                <h3 className="mb-4 font-semibold text-gray-900">材料分配</h3>
                <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
                  <ResultCard label="成品用料" value={weight(result.productWeight)} hint={`${result.productLength.toFixed(2)} mm`} />
                  <ResultCard label="锯缝废屑" value={weight(result.sawdustWeight)} hint={`${result.kerfLength.toFixed(2)} mm`} />
                  <ResultCard label="剩余边料" value={weight(result.scrapWeight)} hint={`${result.remainderLength.toFixed(2)} mm`} />
                  <ResultCard label="整根材料总毛利" value={money(result.totalProfit)} hint={`毛利率 ${result.grossMargin.toFixed(2)}%`} />
                </div>
              </div>

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
                <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">第一阶段未计入人工、设备、能耗、刀具、包装、税费和管理费用，当前结果是材料口径的估算毛利，不是完整利润率。后续数据补齐后再逐步纳入完整加工成本。</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
