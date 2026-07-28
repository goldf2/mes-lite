'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useDismissibleSearchPopup from './useDismissibleSearchPopup'

interface MaterialOption {
  id: string
  code: string
  name: string
  spec?: string | null
  category: string
  unit: string
  stockUnit: string
  valuationUnit: string
}

interface BomItem {
  id: string
  itemType: string
  quantity: number
  unit: string
  wastageRate: number
  material?: MaterialOption | null
  costObject?: { id: string; code: string; name: string; objectType: string; unit: string } | null
  sawingScenario?: { id: string; name: string } | null
}

interface MaterialBom {
  id: string
  sku: string
  name: string
  category: string
  unit: string
  customer?: { id: string; name: string } | null
  sourceMaterialId?: string
  bom?: {
    id: string
    version: string
    isActive: boolean
    items: BomItem[]
  } | null
}

interface DraftBomItem {
  clientId: string
  materialId: string
  quantity: number
  unit: string
  wastageRate: number
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

function qty(value: number, digits = 3) {
  return Number(value || 0).toFixed(digits).replace(/\.?0+$/, '')
}

function materialLabel(material: MaterialOption) {
  return `${material.code} · ${material.name}${material.spec ? ` · ${material.spec}` : ''}`
}

function ProductSearch({
  value,
  products,
  onChange,
}: {
  value: string
  products: MaterialBom[]
  onChange: (value: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const closePopup = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open, closePopup)
  const selected = products.find((product) => product.id === value)
  const filtered = products.filter((product) => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return true
    return `${product.sku} ${product.name} ${product.category} ${product.customer?.name || ''}`.toLowerCase().includes(keyword)
  }).slice(0, 50)

  return (
    <div ref={rootRef} className="relative">
      <input
        value={open ? query : (selected ? `${selected.sku} · ${selected.name}` : query)}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') closePopup()
        }}
        placeholder="输入物料编码、名称或客户筛选"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">没有匹配物料</div>
          ) : (
            filtered.map((product) => (
              <button
                key={product.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(product.id)
                  closePopup()
                }}
                className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50 ${value === product.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-mono text-xs text-gray-500">{product.sku}</span>
                    <span className="ml-2">{product.name}</span>
                    {product.customer && <span className="ml-2 text-xs text-gray-500">{product.customer.name}</span>}
                  </span>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${product.bom?.items.some((item) => item.itemType === 'MATERIAL') ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {product.bom?.items.filter((item) => item.itemType === 'MATERIAL').length || 0} 项
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

function MaterialSearch({
  materials,
  disabledIds,
  onAdd,
}: {
  materials: MaterialOption[]
  disabledIds: string[]
  onAdd: (material: MaterialOption) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const closePopup = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open, closePopup)
  const disabled = new Set(disabledIds)
  const filtered = materials.filter((material) => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return true
    return `${material.code} ${material.name} ${material.spec || ''} ${materialCategoryLabels[material.category] || material.category}`.toLowerCase().includes(keyword)
  }).slice(0, 60)

  return (
    <div ref={rootRef} className="relative">
      <input
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') closePopup()
        }}
        placeholder="输入物料编码、名称或规格添加"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">没有匹配物料</div>
          ) : (
            filtered.map((material) => {
              const alreadyAdded = disabled.has(material.id)
              return (
                <button
                  key={material.id}
                  type="button"
                  disabled={alreadyAdded}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onAdd(material)
                    closePopup()
                  }}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-gray-500">{material.code}</span>
                      <span className="ml-2">{material.name}</span>
                      {material.spec && <span className="ml-2 text-xs text-gray-500">{material.spec}</span>}
                    </span>
                    <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{materialCategoryLabels[material.category] || material.category}</span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

function MaterialSelectSearch({
  value,
  materials,
  onChange,
  placeholder = '输入物料编码、名称或规格筛选',
}: {
  value: string
  materials: MaterialOption[]
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const closePopup = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open, closePopup)
  const selected = materials.find((material) => material.id === value)
  const filtered = materials.filter((material) => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return true
    return `${material.code} ${material.name} ${material.spec || ''} ${materialCategoryLabels[material.category] || material.category}`.toLowerCase().includes(keyword)
  }).slice(0, 60)

  return (
    <div ref={rootRef} className="relative">
      <input
        value={open ? query : (selected ? materialLabel(selected) : query)}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
          if (value) onChange('')
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') closePopup()
        }}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">没有匹配物料</div>
          ) : (
            filtered.map((material) => (
              <button
                key={material.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(material.id)
                  closePopup()
                }}
                className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50 ${value === material.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-mono text-xs text-gray-500">{material.code}</span>
                    <span className="ml-2">{material.name}</span>
                    {material.spec && <span className="ml-2 text-xs text-gray-500">{material.spec}</span>}
                  </span>
                  <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{material.stockUnit || material.unit}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function BomRelationPage({ onMessage }: { onMessage: (msg: string) => void }) {
  const [products, setProducts] = useState<MaterialBom[]>([])
  const [materials, setMaterials] = useState<MaterialOption[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [draftItems, setDraftItems] = useState<DraftBomItem[]>([])
  const [conversionInputMaterialId, setConversionInputMaterialId] = useState('')
  const [conversionOutputProductId, setConversionOutputProductId] = useState('')
  const [conversionInputQty, setConversionInputQty] = useState(1)
  const [conversionOutputQty, setConversionOutputQty] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const detailPanelRef = useRef<HTMLDivElement | null>(null)

  const selectedProduct = products.find((product) => product.id === selectedProductId)
  const conversionInputMaterial = materials.find((material) => material.id === conversionInputMaterialId)
  const conversionOutputProduct = products.find((product) => product.id === conversionOutputProductId)
  const materialById = useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials])
  const materialBomItems = selectedProduct?.bom?.items.filter((item) => item.itemType === 'MATERIAL' && item.material) || []
  const advancedBomItems = selectedProduct?.bom?.items.filter((item) => item.itemType !== 'MATERIAL') || []
  const conversionUnitQty = Number(conversionOutputQty || 0) > 0 ? Number(conversionInputQty || 0) / Number(conversionOutputQty || 0) : 0

  const loadData = useCallback(async (nextSelectedProductId: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/boms')
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '获取 BOM 关系失败')
        return
      }
      const nextProducts = data.products || []
      setProducts(nextProducts)
      setMaterials(data.materialOptions || [])
      const preferred = nextProducts.find((product: MaterialBom) => product.id === nextSelectedProductId)
      const withBom = nextProducts.find((product: MaterialBom) => product.bom?.items.some((item) => item.itemType === 'MATERIAL'))
      const nextProduct = preferred || withBom || nextProducts[0]
      setSelectedProductId(nextProduct?.id || '')
      setDraftItems((nextProduct?.bom?.items || [])
        .filter((item: BomItem) => item.itemType === 'MATERIAL' && item.material)
        .map((item: BomItem) => ({
          clientId: item.id,
          materialId: item.material?.id || '',
          quantity: Number(item.quantity || 0),
          unit: item.unit || item.material?.stockUnit || item.material?.unit || '件',
          wastageRate: Number(item.wastageRate || 0),
        })))
    } catch (error) {
      onMessage('获取 BOM 关系失败')
    } finally {
      setLoading(false)
    }
  }, [onMessage])

  useEffect(() => {
    loadData('')
  }, [loadData])

  const selectProduct = (productId: string, options: { scrollToDetail?: boolean } = {}) => {
    const product = products.find((item) => item.id === productId)
    setSelectedProductId(productId)
    setDraftItems((product?.bom?.items || [])
      .filter((item) => item.itemType === 'MATERIAL' && item.material)
      .map((item) => ({
        clientId: item.id,
        materialId: item.material?.id || '',
        quantity: Number(item.quantity || 0),
        unit: item.unit || item.material?.stockUnit || item.material?.unit || '件',
        wastageRate: Number(item.wastageRate || 0),
      })))
    if (options.scrollToDetail) {
      window.setTimeout(() => detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
    }
  }

  const addMaterial = (material: MaterialOption) => {
    if (draftItems.some((item) => item.materialId === material.id)) {
      onMessage('该物料已在当前 BOM 中')
      return
    }
    setDraftItems((current) => [
      ...current,
      {
        clientId: `new-${material.id}-${Date.now()}`,
        materialId: material.id,
        quantity: 1,
        unit: material.stockUnit || material.unit || '件',
        wastageRate: 0,
      },
    ])
  }

  const applyMaterialConversion = () => {
    if (!conversionInputMaterial) return onMessage('请选择原材料')
    if (!conversionOutputProduct) return onMessage('请选择产出物料')
    if (Number(conversionInputQty || 0) <= 0) return onMessage('原材料数量必须大于 0')
    if (Number(conversionOutputQty || 0) <= 0) return onMessage('产出数量必须大于 0')
    if ([conversionOutputProduct.id, conversionOutputProduct.sourceMaterialId].filter(Boolean).includes(conversionInputMaterial.id)) {
      return onMessage('原材料不能和产出物料相同')
    }

    const nextQuantity = Number((Number(conversionInputQty) / Number(conversionOutputQty)).toFixed(8))
    selectProduct(conversionOutputProduct.id, { scrollToDetail: true })
    setDraftItems((current) => {
      const existing = current.find((item) => item.materialId === conversionInputMaterial.id)
      if (existing) {
        return current.map((item) => item.materialId === conversionInputMaterial.id ? {
          ...item,
          quantity: nextQuantity,
          unit: conversionInputMaterial.stockUnit || conversionInputMaterial.unit || item.unit || '件',
        } : item)
      }
      return [
        ...current,
        {
          clientId: `conversion-${conversionInputMaterial.id}-${Date.now()}`,
          materialId: conversionInputMaterial.id,
          quantity: nextQuantity,
          unit: conversionInputMaterial.stockUnit || conversionInputMaterial.unit || '件',
          wastageRate: 0,
        },
      ]
    })
    onMessage('已按产出关系更新 BOM 用量')
  }

  const updateDraftItem = (clientId: string, patch: Partial<DraftBomItem>) => {
    setDraftItems((current) => current.map((item) => item.clientId === clientId ? { ...item, ...patch } : item))
  }

  const saveBom = async () => {
    if (!selectedProductId) return onMessage('请选择物料')
    setSaving(true)
    try {
      const res = await fetch('/api/boms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProductId,
          items: draftItems.map((item) => ({
            materialId: item.materialId,
            quantity: Number(item.quantity || 0),
            unit: item.unit,
            wastageRate: Number(item.wastageRate || 0),
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '保存 BOM 关系失败')
        return
      }
      onMessage(data.message || 'BOM 关系已保存')
      await loadData(selectedProductId)
    } catch (error) {
      onMessage('保存 BOM 关系失败')
    } finally {
      setSaving(false)
    }
  }

  const usageRows = useMemo(() => {
    const rows: Array<{ material: MaterialOption; products: Array<{ product: MaterialBom; item: BomItem }> }> = []
    for (const material of materials) {
      const productsUsing = products.flatMap((product) => (product.bom?.items || [])
        .filter((item) => item.itemType === 'MATERIAL' && item.material?.id === material.id)
        .map((item) => ({ product, item })))
      if (productsUsing.length > 0) rows.push({ material, products: productsUsing })
    }
    const search = keyword.trim().toLowerCase()
    if (!search) return rows.slice(0, 80)
    return rows.filter((row) => `${row.material.code} ${row.material.name} ${row.material.spec || ''} ${row.products.map(({ product }) => `${product.sku} ${product.name}`).join(' ')}`.toLowerCase().includes(search)).slice(0, 80)
  }, [keyword, materials, products])

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">BOM 关系</h2>
            <div className="mt-1 text-sm text-gray-500">物料和原材料用量关系 · 后续可继续接入成本计算</div>
          </div>
          <button
            type="button"
            onClick={saveBom}
            disabled={saving || !selectedProductId}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存 BOM'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-lg bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-gray-900">选择物料</h3>
              {loading && <span className="text-xs text-gray-500">加载中...</span>}
            </div>
            <ProductSearch value={selectedProductId} products={products} onChange={selectProduct} />
            {selectedProduct && (
              <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900">{selectedProduct.name}</div>
                    <div className="mt-1 text-xs text-gray-500">{selectedProduct.sku} · {selectedProduct.unit}{selectedProduct.customer ? ` · ${selectedProduct.customer.name}` : ''}</div>
                  </div>
                  <span className={`shrink-0 rounded px-2 py-1 text-xs ${selectedProduct.bom ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {selectedProduct.bom ? `${materialBomItems.length} 项` : '无 BOM'}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-white p-5 shadow-sm">
            <h3 className="mb-3 font-semibold text-gray-900">添加原材料</h3>
            <MaterialSearch materials={materials} disabledIds={[...draftItems.map((item) => item.materialId), selectedProduct?.sourceMaterialId || ''].filter(Boolean)} onAdd={addMaterial} />
          </div>

          <div className="rounded-lg bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-gray-900">原材料产出换算</h3>
              {conversionUnitQty > 0 && (
                <span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">
                  1 个产出 = {qty(conversionUnitQty, 6)} {conversionInputMaterial?.stockUnit || conversionInputMaterial?.unit || '原材料'}
                </span>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">原材料</label>
                <MaterialSelectSearch value={conversionInputMaterialId} materials={materials} onChange={setConversionInputMaterialId} placeholder="输入原材料编码、名称或规格筛选" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">产出物料</label>
                <ProductSearch value={conversionOutputProductId} products={products} onChange={setConversionOutputProductId} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">原材料数量</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={conversionInputQty || ''}
                    onChange={(event) => setConversionInputQty(Math.max(0, Number(event.target.value)))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">产出数量</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={conversionOutputQty || ''}
                    onChange={(event) => setConversionOutputQty(Math.max(0, Number(event.target.value)))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={applyMaterialConversion}
                className="w-full rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
              >
                换算并打开 BOM
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <div className="text-xs text-blue-700">物料数</div>
              <div className="mt-1 text-xl font-semibold text-blue-900">{products.length}</div>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
              <div className="text-xs text-emerald-700">有 BOM</div>
              <div className="mt-1 text-xl font-semibold text-emerald-900">{products.filter((product) => product.bom?.items.some((item) => item.itemType === 'MATERIAL')).length}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-xs text-gray-500">物料项</div>
              <div className="mt-1 text-xl font-semibold text-gray-900">{draftItems.length}</div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div ref={detailPanelRef} className="scroll-mt-24 rounded-lg bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">物料 BOM 明细</h3>
                <div className="mt-1 text-sm text-gray-500">
                  {selectedProduct ? `${selectedProduct.sku} · ${selectedProduct.name}` : '未选择物料'}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-gray-100 px-2 py-1 text-gray-600">{selectedProduct?.bom ? selectedProduct.bom.version : '未创建 BOM'}</span>
                <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">{draftItems.length} 个原材料项</span>
              </div>
            </div>
            {draftItems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">暂无物料 BOM 项，请先添加原材料</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="px-3 py-2">原材料</th>
                      <th className="px-3 py-2 text-right">用量</th>
                      <th className="px-3 py-2">单位</th>
                      <th className="px-3 py-2 text-right">损耗率</th>
                      <th className="px-3 py-2 text-right">含损耗用量</th>
                      <th className="px-3 py-2 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {draftItems.map((item) => {
                      const material = materialById.get(item.materialId)
                      const quantityWithWastage = Number(item.quantity || 0) * (1 + Number(item.wastageRate || 0) / 100)
                      return (
                        <tr key={item.clientId} className="align-top hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-900">{material ? material.name : '未知物料'}</div>
                            <div className="mt-1 font-mono text-xs text-blue-700">{material ? material.code : item.materialId}</div>
                            {material?.spec && <div className="mt-1 text-xs text-gray-500">{material.spec}</div>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.quantity || ''}
                              onChange={(event) => updateDraftItem(item.clientId, { quantity: Math.max(0, Number(event.target.value)) })}
                              className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-right text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={item.unit}
                              onChange={(event) => updateDraftItem(item.clientId, { unit: event.target.value })}
                              className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={item.wastageRate || ''}
                                onChange={(event) => updateDraftItem(item.clientId, { wastageRate: Math.max(0, Number(event.target.value)) })}
                                className="w-24 px-3 py-2 text-right text-sm outline-none"
                              />
                              <span className="flex items-center border-l border-gray-200 bg-gray-50 px-2 text-xs text-gray-500">%</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700">{qty(quantityWithWastage, 4)} {item.unit || material?.stockUnit || material?.unit}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => setDraftItems((current) => current.filter((draft) => draft.clientId !== item.clientId))}
                              className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              移除
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {advancedBomItems.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
                当前物料还包含 {advancedBomItems.length} 个成本对象或锯切成本项，本页保存物料 BOM 时会保留这些高级项。
              </div>
            )}
          </div>

          <div className="rounded-lg bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">原材料反查</h3>
                <div className="mt-1 text-sm text-gray-500">查看某个物料被哪些 BOM 使用</div>
              </div>
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索物料或 BOM"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm lg:w-80"
              />
            </div>
            {usageRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">暂无原材料使用关系</div>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {usageRows.map((row) => (
                  <div key={row.material.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900">{row.material.name}</div>
                        <div className="mt-1 font-mono text-xs text-blue-700">{row.material.code}</div>
                        {row.material.spec && <div className="mt-1 text-xs text-gray-500">{row.material.spec}</div>}
                      </div>
                      <span className="shrink-0 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{row.products.length} 个 BOM</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {row.products.slice(0, 6).map(({ product, item }) => {
                        const isSelected = product.id === selectedProductId
                        const itemCount = product.bom?.items.filter((bomItem) => bomItem.itemType === 'MATERIAL').length || 0
                        return (
                        <button
                          key={`${product.id}-${item.id}`}
                          type="button"
                          onClick={() => selectProduct(product.id, { scrollToDetail: true })}
                          className={`block w-full rounded-lg border px-3 py-2 text-left text-xs transition ${isSelected ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-medium">{product.name}</div>
                              <div className="mt-1 truncate font-mono text-[11px] text-blue-700">{product.sku}</div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="rounded bg-white px-2 py-0.5 text-[11px] text-gray-600">{isSelected ? '当前 BOM' : '查看 BOM'}</div>
                              <div className="mt-1 text-gray-500">{itemCount} 项</div>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-3 rounded bg-white/70 px-2 py-1">
                            <span className="truncate text-gray-500">用量</span>
                            <span className="shrink-0 font-medium">{qty(item.quantity, 4)} {item.unit}</span>
                          </div>
                        </button>
                        )
                      })}
                      {row.products.length > 6 && <div className="px-3 text-xs text-gray-500">还有 {row.products.length - 6} 个 BOM</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
