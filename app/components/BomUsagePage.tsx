'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { SearchFieldWithPresets } from './SavedSearchPresets'

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
}

interface BomProduct {
  id: string
  sku: string
  name: string
  unit: string
  customer?: { id: string; name: string } | null
  bom?: {
    outputQuantity: number
    outputUnit: string
    items: BomItem[]
  } | null
}

interface UsageRow {
  material: MaterialOption
  products: Array<{ product: BomProduct; item: BomItem }>
}

export default function BomUsagePage({
  onMessage,
  onOpenBom,
}: {
  onMessage: (msg: string) => void
  onOpenBom: (productId: string) => void
}) {
  const [products, setProducts] = useState<BomProduct[]>([])
  const [materials, setMaterials] = useState<MaterialOption[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/boms')
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '获取 BOM 反查数据失败')
        return
      }
      setProducts(data.products || [])
      setMaterials(data.materialOptions || [])
    } catch (error) {
      onMessage('获取 BOM 反查数据失败')
    } finally {
      setLoading(false)
    }
  }, [onMessage])

  useEffect(() => {
    loadData()
  }, [loadData])

  const usageRows = useMemo(() => {
    const search = keyword.trim().toLowerCase()
    return materials
      .map<UsageRow>((material) => ({
        material,
        products: products.flatMap((product) => (product.bom?.items || [])
          .filter((item) => item.itemType === 'MATERIAL' && item.material?.id === material.id)
          .map((item) => ({ product, item }))),
      }))
      .filter((row) => row.products.length > 0)
      .filter((row) => {
        if (!search) return true
        const productText = row.products
          .map(({ product }) => `${product.sku} ${product.name} ${product.customer?.name || ''}`)
          .join(' ')
        return `${row.material.code} ${row.material.name} ${row.material.spec || ''} ${productText}`
          .toLowerCase()
          .includes(search)
      })
      .sort((left, right) => right.products.length - left.products.length || left.material.code.localeCompare(right.material.code, 'zh-CN'))
  }, [keyword, materials, products])

  const referencedProductCount = useMemo(
    () => new Set(usageRows.flatMap((row) => row.products.map(({ product }) => product.id))).size,
    [usageRows],
  )

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 border-b border-gray-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">BOM 反查</h2>
          <p className="mt-1 text-sm text-gray-500">从原材料出发，查看它被哪些产品 BOM 使用</p>
        </div>
        <SearchFieldWithPresets
          storageKey="mes-lite.searchPresets.bomUsage"
          value={keyword}
          onChange={setKeyword}
          placeholder="搜索原材料、产品或客户"
          className="flex w-full items-center gap-2 sm:max-w-[450px]"
          inputClassName="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
      </header>

      <div className="grid grid-cols-2 border-y border-gray-200 bg-white sm:max-w-lg">
        <div className="px-4 py-3">
          <div className="text-xs text-gray-500">被引用物料</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">{usageRows.length}</div>
        </div>
        <div className="border-l border-gray-200 px-4 py-3">
          <div className="text-xs text-gray-500">关联产品</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">{referencedProductCount}</div>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-500">加载中...</div>
      ) : usageRows.length === 0 ? (
        <div className="border border-dashed border-gray-300 bg-white px-4 py-12 text-center text-sm text-gray-500">
          {keyword ? '没有匹配的 BOM 引用关系' : '暂无 BOM 引用关系'}
        </div>
      ) : (
        <div className="space-y-3">
          {usageRows.map((row) => (
            <article key={row.material.id} className="rounded-lg border border-gray-200 bg-white">
              <div className="flex flex-col gap-2 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-gray-900">{row.material.name}</span>
                    <span className="font-mono text-xs text-blue-700">{row.material.code}</span>
                    {row.material.spec && <span className="text-xs text-gray-500">{row.material.spec}</span>}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">库存单位：{row.material.stockUnit || row.material.unit}</div>
                </div>
                <span className="shrink-0 text-sm font-medium text-gray-700">{row.products.length} 个产品 BOM</span>
              </div>

              <div className="divide-y divide-gray-100">
                {row.products.map(({ product, item }) => (
                    <div
                      key={`${product.id}-${item.id}`}
                      className="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-gray-900">{product.name}</div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                          <span className="font-mono text-blue-700">{product.sku}</span>
                          {product.customer && <span>{product.customer.name}</span>}
                        </div>
                      </div>
                      <div className={`rounded px-2 py-1 text-xs ${item.quantity > 0 ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                        {item.quantity > 0
                          ? `单位耗用 ${Number(item.quantity).toFixed(6).replace(/\.?0+$/, '')} ${item.unit}/件`
                          : '待填写单位耗用'}
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenBom(product.id)}
                        className="justify-self-start rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 lg:justify-self-end"
                      >
                        打开 BOM 关联
                      </button>
                    </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
