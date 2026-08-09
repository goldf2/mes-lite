'use client'

import { MaterialChoiceSearch } from '@/modules/materials'
import type { SawingProcessOption, SawingProductOption } from '../contracts/sawing-cost'

export default function SaveSawingCostPanel({
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
  productOptions: SawingProductOption[]
  processOptions: SawingProcessOption[]
  selectedProcessIds: string[]
  setSelectedProcessIds: (value: string[]) => void
  saving: boolean
  onSave: () => void
}) {
  return (
    <div className="rounded-lg bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-gray-900">保存为成本对象</h3>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <input value={scenarioName} onChange={(event) => setScenarioName(event.target.value)} placeholder="自定义名称（可选，默认自动命名）" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        <button type="button" onClick={onSave} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? '保存中...' : '保存成本对象'}</button>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
        <select value={productKind} onChange={(event) => setProductKind(event.target.value as 'TEMPORARY' | 'EXISTING')} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <option value="TEMPORARY">保存为临时成本对象</option>
          <option value="EXISTING">绑定已有物料</option>
        </select>
        {productKind === 'EXISTING' ? (
          <MaterialChoiceSearch value={selectedProductId} onChange={setSelectedProductId} options={productOptions} placeholder="输入物料编码或名称筛选" />
        ) : (
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-500">临时成本对象会保留单件材料成本、人工时和机时，后续可直接加入混合测算。</div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-600">BOM 组成</div>
        <div className="space-y-2">
          <button type="button" onClick={() => setBomProductId('')} className={`rounded-lg border px-3 py-2 text-sm ${bomProductId ? 'border-gray-200 text-gray-600' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>不加入物料 BOM</button>
          <MaterialChoiceSearch value={bomProductId} onChange={setBomProductId} options={productOptions} placeholder="输入物料编码或名称，选择要加入的 BOM" />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {processOptions.map((process) => (
          <label key={process.id} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs ${selectedProcessIds.includes(process.id) ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
            <input type="checkbox" className="mr-1.5" checked={selectedProcessIds.includes(process.id)} onChange={(event) => setSelectedProcessIds(event.target.checked ? [...selectedProcessIds, process.id] : selectedProcessIds.filter((id) => id !== process.id))} />
            {process.name}
          </label>
        ))}
      </div>
    </div>
  )
}
