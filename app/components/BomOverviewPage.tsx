'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, PackageMinus, PackagePlus } from 'lucide-react'
import { SearchFieldWithPresets } from './SavedSearchPresets'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import TopBarPortal from './TopBarPortal'

interface MaterialOption {
  id: string
  code: string
  name: string
  spec?: string | null
  category: string
  unit: string
  stockUnit: string
}

interface BomItem {
  id: string
  itemType: string
  quantity: number
  unit: string
  wastageRate: number
  material?: MaterialOption | null
  outputMaterialId?: string | null
  outputMaterial?: MaterialOption | null
}

interface BomOutput {
  id: string
  quantity: number
  unit: string
  isPrimary: boolean
  material: MaterialOption
}

interface BomVersion {
  id: string
  name: string
  purpose: 'PRODUCTION' | 'PACKAGING'
  version: string
  isDefault: boolean
  isActive: boolean
  outputQuantity: number
  outputUnit: string
  outputs: BomOutput[]
  items: BomItem[]
}

interface BomOwner {
  id: string
  sku: string
  name: string
  unit: string
  sourceMaterialId?: string
  boms: BomVersion[]
}

interface ListedBom {
  owner: BomOwner
  bom: BomVersion
  editorMaterialId: string
  primaryOutput?: BomOutput
}

interface RelationCounts {
  outputBomIds: Set<string>
  inputBomIds: Set<string>
}

function countDistinctRelations(counts?: RelationCounts) {
  if (!counts) return 0
  const bomIds = new Set<string>()
  counts.outputBomIds.forEach((bomId) => bomIds.add(bomId))
  counts.inputBomIds.forEach((bomId) => bomIds.add(bomId))
  return bomIds.size
}

const categoryLabels: Record<string, string> = {
  RAW: '原材料',
  FINISHED: '成品',
  AUXILIARY: '辅材',
  SCRAP: '废料',
  DEFECTIVE: '废品',
  PACKAGING: '包装物',
  OTHER: '其他',
}

function quantity(value: number) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 6 })
}

function materialLabel(material: MaterialOption) {
  return `${material.name}${material.spec ? ` · ${material.spec}` : ''}`
}

function BomStatus({ bom }: { bom: BomVersion }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${bom.purpose === 'PACKAGING' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
        {bom.purpose === 'PACKAGING' ? '包装' : '生产'}
      </span>
      {bom.isDefault && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">默认</span>}
      {!bom.isActive && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">已停用</span>}
    </span>
  )
}

export default function BomOverviewPage({
  onMessage,
  onOpenBom,
}: {
  onMessage: (msg: string) => void
  onOpenBom: (materialId: string, bomId: string) => void
}) {
  const [owners, setOwners] = useState<BomOwner[]>([])
  const [materials, setMaterials] = useState<MaterialOption[]>([])
  const [keyword, setKeyword] = useState('')
  const [selectedMaterialId, setSelectedMaterialId] = useState('')
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/boms')
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '获取 BOM 全览数据失败')
        return
      }
      setOwners(data.products || [])
      setMaterials(data.materialOptions || [])
    } catch (error) {
      onMessage('获取 BOM 全览数据失败')
    } finally {
      setLoading(false)
    }
  }, [onMessage])

  useEffect(() => {
    loadData()
  }, [loadData])

  const allBoms = useMemo<ListedBom[]>(() => owners.flatMap((owner) => owner.boms.map((bom) => {
    const primaryOutput = bom.outputs.find((output) => output.isPrimary) || bom.outputs[0]
    return {
      owner,
      bom,
      primaryOutput,
      editorMaterialId: primaryOutput?.material.id || owner.sourceMaterialId || '',
    }
  })), [owners])

  const relationCounts = useMemo(() => {
    const result = new Map<string, RelationCounts>()
    const ensure = (materialId: string) => {
      const existing = result.get(materialId)
      if (existing) return existing
      const created = { outputBomIds: new Set<string>(), inputBomIds: new Set<string>() }
      result.set(materialId, created)
      return created
    }
    allBoms.forEach(({ bom }) => {
      bom.outputs.forEach((output) => ensure(output.material.id).outputBomIds.add(bom.id))
      bom.items.forEach((item) => {
        if (item.itemType === 'MATERIAL' && item.material) ensure(item.material.id).inputBomIds.add(bom.id)
      })
    })
    return result
  }, [allBoms])

  useEffect(() => {
    if (keyword.trim()) return
    if (selectedMaterialId && materials.some((material) => material.id === selectedMaterialId)) return
    const firstRelated = materials.find((material) => {
      const counts = relationCounts.get(material.id)
      return Boolean(counts && (counts.outputBomIds.size > 0 || counts.inputBomIds.size > 0))
    })
    setSelectedMaterialId(firstRelated?.id || materials[0]?.id || '')
  }, [keyword, materials, relationCounts, selectedMaterialId])

  const filteredMaterials = useMemo(() => {
    const search = keyword.trim().toLocaleLowerCase()
    return materials
      .filter((material) => !search || [material.code, material.name, material.spec, categoryLabels[material.category]]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
        .includes(search))
      .sort((left, right) => {
        const leftCounts = relationCounts.get(left.id)
        const rightCounts = relationCounts.get(right.id)
        const leftTotal = countDistinctRelations(leftCounts)
        const rightTotal = countDistinctRelations(rightCounts)
        return rightTotal - leftTotal || left.code.localeCompare(right.code, 'zh-CN', { numeric: true })
      })
  }, [keyword, materials, relationCounts])

  useEffect(() => {
    if (filteredMaterials.length === 0) {
      if (selectedMaterialId) setSelectedMaterialId('')
      return
    }
    if (filteredMaterials.some((material) => material.id === selectedMaterialId)) return
    setSelectedMaterialId(filteredMaterials[0].id)
  }, [filteredMaterials, selectedMaterialId])

  const selectedMaterial = materials.find((material) => material.id === selectedMaterialId) || null

  const outputRelations = useMemo(() => {
    if (!selectedMaterial) return []
    return allBoms.flatMap((listed) => {
      const selectedOutput = listed.bom.outputs.find((output) => output.material.id === selectedMaterial.id)
      if (!selectedOutput) return []
      const relatedItems = listed.bom.items.filter((item) => item.itemType === 'MATERIAL' && item.material)
      return [{ ...listed, selectedOutput, relatedItems }]
    })
  }, [allBoms, selectedMaterial])

  const inputRelations = useMemo(() => {
    if (!selectedMaterial) return []
    return allBoms.flatMap((listed) => {
      const usageItems = listed.bom.items.filter((item) => item.itemType === 'MATERIAL' && item.material?.id === selectedMaterial.id)
      return usageItems.length > 0 ? [{ ...listed, usageItems }] : []
    })
  }, [allBoms, selectedMaterial])

  const relatedBomCount = useMemo(() => new Set([
    ...outputRelations.map(({ bom }) => bom.id),
    ...inputRelations.map(({ bom }) => bom.id),
  ]).size, [inputRelations, outputRelations])

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          primaryFilters={(
            <SearchFieldWithPresets
              storageKey="mes-lite.searchPresets.bomOverview"
              value={keyword}
              onChange={setKeyword}
              placeholder="搜索物料名称、编码或规格"
            />
          )}
        />
      </TopBarPortal>

      <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
        <aside
          aria-label="BOM 全览物料列表"
          className="min-w-0 rounded-lg border border-gray-200 bg-white p-3 xl:sticky xl:top-0 xl:max-h-[calc(100dvh-10rem)] xl:overflow-y-auto xl:overscroll-contain"
        >
          <div className="mb-3 flex items-start justify-between gap-3 px-1">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900">物料</h2>
              <p className="mt-0.5 text-xs text-gray-500">选择物料查看全部直接 BOM 关系</p>
            </div>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">{filteredMaterials.length}</span>
          </div>

          {loading ? (
            <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">正在加载 BOM...</div>
          ) : filteredMaterials.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">没有匹配的物料</div>
          ) : (
            <div className="space-y-1.5">
              {filteredMaterials.map((material) => {
                const counts = relationCounts.get(material.id)
                const outputCount = counts?.outputBomIds.size || 0
                const inputCount = counts?.inputBomIds.size || 0
                const isSelected = material.id === selectedMaterialId
                return (
                  <button
                    key={material.id}
                    type="button"
                    onClick={() => setSelectedMaterialId(material.id)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${isSelected ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-100' : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'}`}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900">{material.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-gray-500">
                          <span className="font-mono text-blue-700">{material.code}</span>
                          {material.spec ? ` · ${material.spec}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                        {categoryLabels[material.category] || material.category}
                      </span>
                    </span>
                    <span className="mt-2 flex gap-3 text-[11px] text-gray-500">
                      <span>作为产出 {outputCount}</span>
                      <span>作为投入 {inputCount}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </aside>

        <main className="min-w-0 bg-white">
          {selectedMaterial ? (
            <>
              <header className="border-b border-gray-200 pb-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-gray-900">{selectedMaterial.name}</h2>
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{categoryLabels[selectedMaterial.category] || selectedMaterial.category}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-500">
                      <span className="font-mono text-blue-700">{selectedMaterial.code}</span>
                      {selectedMaterial.spec && <span>{selectedMaterial.spec}</span>}
                      <span>库存单位：{selectedMaterial.stockUnit || selectedMaterial.unit}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-gray-700">关联 {relatedBomCount} 个 BOM</span>
                </div>
              </header>

              <div className="grid grid-cols-3 border-b border-gray-200">
                <div className="py-3 pr-3">
                  <div className="text-xs text-gray-500">关联 BOM</div>
                  <div className="mt-1 text-xl font-semibold text-gray-900">{relatedBomCount}</div>
                </div>
                <div className="border-l border-gray-200 px-3 py-3">
                  <div className="text-xs text-gray-500">作为产出</div>
                  <div className="mt-1 text-xl font-semibold text-emerald-700">{outputRelations.length}</div>
                </div>
                <div className="border-l border-gray-200 pl-3 py-3">
                  <div className="text-xs text-gray-500">作为投入</div>
                  <div className="mt-1 text-xl font-semibold text-blue-700">{inputRelations.length}</div>
                </div>
              </div>

              <section className="py-5" aria-labelledby="bom-output-relations">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <PackagePlus className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                    <h3 id="bom-output-relations" className="text-base font-semibold text-gray-900">作为产出</h3>
                  </div>
                  <span className="text-xs text-gray-500">{outputRelations.length} 个 BOM</span>
                </div>

                {outputRelations.length === 0 ? (
                  <div className="border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">该物料尚未作为任何 BOM 的产出</div>
                ) : (
                  <div className="divide-y divide-gray-200 border-y border-gray-200">
                    {outputRelations.map(({ bom, selectedOutput, relatedItems, editorMaterialId }) => (
                      <article key={`output-${bom.id}`} className="py-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-gray-900">{bom.name}</span>
                              <span className="text-xs text-gray-500">{bom.version}</span>
                              <BomStatus bom={bom} />
                            </div>
                            <div className="mt-2 text-sm text-gray-700">
                              产出 <span className="font-medium text-emerald-700">{quantity(selectedOutput.quantity)} {selectedOutput.material.stockUnit || selectedOutput.unit}</span>
                              {selectedOutput.isPrimary ? ' · 主产出' : ' · 其他产出'}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {relatedItems.length === 0 ? (
                                <span className="text-xs text-amber-700">该 BOM 尚未配置批次投入</span>
                              ) : relatedItems.map((item) => item.material && (
                                <span key={item.id} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                                  每批投入 {materialLabel(item.material)} · {quantity(item.quantity)} {item.unit}
                                  {Number(item.wastageRate) > 0 ? ` · 损耗 ${quantity(Number(item.wastageRate) * 100)}%` : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onOpenBom(editorMaterialId, bom.id)}
                            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                          >
                            打开编辑
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="border-t border-gray-200 py-5" aria-labelledby="bom-input-relations">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <PackageMinus className="h-4 w-4 text-blue-700" aria-hidden="true" />
                    <h3 id="bom-input-relations" className="text-base font-semibold text-gray-900">作为投入</h3>
                  </div>
                  <span className="text-xs text-gray-500">{inputRelations.length} 个 BOM</span>
                </div>

                {inputRelations.length === 0 ? (
                  <div className="border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">该物料尚未被任何 BOM 作为投入使用</div>
                ) : (
                  <div className="divide-y divide-gray-200 border-y border-gray-200">
                    {inputRelations.map(({ bom, usageItems, primaryOutput, editorMaterialId }) => (
                      <article key={`input-${bom.id}`} className="py-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-gray-900">{bom.name}</span>
                              <span className="text-xs text-gray-500">{bom.version}</span>
                              <BomStatus bom={bom} />
                            </div>
                            {primaryOutput && (
                              <div className="mt-1 text-xs text-gray-500">主产出：{materialLabel(primaryOutput.material)}</div>
                            )}
                            <div className="mt-2 space-y-1.5">
                              {usageItems.map((item) => (
                                <div key={item.id} className="flex flex-wrap items-center gap-1.5 text-sm text-gray-700">
                                  <span className="font-medium text-blue-700">每批投入 {quantity(item.quantity)} {item.unit}</span>
                                  <ArrowRight className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                                  <span>{bom.outputs.map((output) => `${materialLabel(output.material)} ${quantity(output.quantity)} ${output.material.stockUnit || output.unit}`).join('；')}</span>
                                  {Number(item.wastageRate) > 0 && <span className="text-xs text-amber-700">损耗 {quantity(Number(item.wastageRate) * 100)}%</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onOpenBom(editorMaterialId, bom.id)}
                            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                          >
                            打开编辑
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : (
            <div className="border border-dashed border-gray-300 px-4 py-16 text-center text-sm text-gray-500">
              {loading ? '正在加载 BOM...' : '请选择一个物料查看 BOM 关系'}
            </div>
          )}
        </main>
      </div>
    </>
  )
}
