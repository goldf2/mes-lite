'use client'

import { ReactNode, useState, useEffect } from 'react'
import AttachmentPanel from './AttachmentPanel'
import StatusCheckboxFilter, { getMultiSelectQuery } from './StatusCheckboxFilter'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import TopBarPortal from './TopBarPortal'

interface Material {
  id: string
  code: string
  name: string
  spec: string
  category: string
  customerId?: string | null
  customer?: { id: string; code: string; name: string } | null
  unit: string
  stockUnit: string
  valuationUnit: string
  conversionRate: number
  conversionNote?: string
  costingMethod: string
  stock?: {
    qty: number
    reservedQty: number
    availableQty: number
    valuationQty: number
    reservedValuationQty: number
    availableValuationQty: number
    totalCost: number
    valuationUnitCost: number
    stockUnitCost: number
  }
  primaryImage?: { id: string; url: string; note?: string; mimeType: string; isCover: boolean } | null
  createdAt: string
}

interface Customer {
  id: string
  code: string
  name: string
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

const materialCategoryOptions = [
  ['RAW', '原材料'],
  ['FINISHED', '成品'],
  ['AUXILIARY', '辅材'],
  ['SCRAP', '废料'],
  ['DEFECTIVE', '废品'],
  ['PACKAGING', '包装物'],
  ['OTHER', '其他'],
] as const

const materialCategoryFilterOptions = materialCategoryOptions.map(([value, label]) => ({ value, label }))

export default function MaterialPage({
  onMessage,
  onToolbarChange,
}: {
  onMessage: (msg: string) => void
  onToolbarChange?: (actions: ReactNode | null) => void
}) {
  const [materials, setMaterials] = useState<Material[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [keyword, setKeyword] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>(materialCategoryFilterOptions.map((option) => option.value))
  const [showModal, setShowModal] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null)
  const [detailMaterial, setDetailMaterial] = useState<Material | null>(null)
  const [form, setForm] = useState({
    code: '',
    name: '',
    spec: '',
    category: 'RAW',
    customerId: '',
    unit: '',
    stockUnit: '',
    useDualUnit: false,
    valuationUnit: '',
    conversionRate: 1,
    conversionNote: '',
    costingMethod: 'WEIGHTED_AVERAGE',
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchMaterials()
  }, [keyword, selectedCategories, customerFilter])

  useEffect(() => {
    fetchCustomers()
  }, [])

  const fetchMaterials = async () => {
    const params = new URLSearchParams()
    if (keyword) params.set('keyword', keyword)
    if (customerFilter) params.set('customerId', customerFilter)
    const categoryQuery = getMultiSelectQuery('categories', selectedCategories, materialCategoryFilterOptions)
    if (categoryQuery) {
      const categoryParams = new URLSearchParams(categoryQuery)
      categoryParams.forEach((value, key) => params.set(key, value))
    }
    const url = params.toString() ? `/api/materials?${params.toString()}` : '/api/materials'
    const res = await fetch(url)
    const data = await res.json()
    const nextMaterials: Material[] = data.data || []
    setMaterials(nextMaterials)
    setDetailMaterial((current) => current ? nextMaterials.find((item) => item.id === current.id) || current : null)
  }

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customers')
      if (res.ok) {
        const data = await res.json()
        setCustomers(data.data || [])
      }
    } catch (err) {
      // ignore
    }
  }

  const handleSubmit = async () => {
    if (!form.code || !form.name || !form.stockUnit || (form.useDualUnit && (!form.valuationUnit || form.conversionRate <= 0))) {
      onMessage('请填写完整信息')
      return
    }
    setLoading(true)
    try {
      const payload = {
        code: form.code,
        name: form.name,
        spec: form.spec,
        category: form.category,
        customerId: form.customerId || undefined,
        unit: form.stockUnit,
        stockUnit: form.stockUnit,
        valuationUnit: form.useDualUnit ? form.valuationUnit : form.stockUnit,
        conversionRate: form.useDualUnit ? form.conversionRate : 1,
        conversionNote: form.conversionNote || undefined,
        costingMethod: form.costingMethod,
      }
      if (editingMaterial) {
        const res = await fetch('/api/materials', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, id: editingMaterial.id }),
        })
        const data = await res.json()
        if (res.ok) {
          onMessage('物料更新成功')
        } else {
          onMessage(data.error || '更新失败')
        }
      } else {
        const res = await fetch('/api/materials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (res.ok) {
          onMessage('物料创建成功')
        } else {
          onMessage(data.error || '创建失败')
        }
      }
      setShowModal(false)
      setForm({ code: '', name: '', spec: '', category: 'RAW', customerId: '', unit: '', stockUnit: '', useDualUnit: false, valuationUnit: '', conversionRate: 1, conversionNote: '', costingMethod: 'WEIGHTED_AVERAGE' })
      setEditingMaterial(null)
      fetchMaterials()
    } catch (err) {
      onMessage('操作失败')
    }
    setLoading(false)
  }

  const handleArchive = async (id: string) => {
    if (!confirm('确定要归档该物料吗？归档后不会在物料列表中显示，可在归档记录中恢复。')) return
    try {
      const res = await fetch(`/api/materials/${id}/archive`, { method: 'PATCH' })
      const data = await res.json()
      if (res.ok) {
        onMessage(data.message || '归档成功')
        fetchMaterials()
      } else {
        onMessage(data.error || '归档失败')
      }
    } catch (err) {
      onMessage('归档失败')
    }
  }

  const handleEdit = (material: Material) => {
    const stockUnit = material.stockUnit || material.unit
    const valuationUnit = material.valuationUnit || material.unit
    const useDualUnit = valuationUnit !== stockUnit || Number(material.conversionRate || 1) !== 1
    setEditingMaterial(material)
    setForm({
      code: material.code,
      name: material.name,
      spec: material.spec,
      category: material.category || 'RAW',
      customerId: material.customerId || '',
      unit: stockUnit,
      stockUnit,
      useDualUnit,
      valuationUnit: useDualUnit ? valuationUnit : '',
      conversionRate: material.conversionRate || 1,
      conversionNote: material.conversionNote || '',
      costingMethod: material.costingMethod || 'WEIGHTED_AVERAGE',
    })
    setShowModal(true)
  }

  const handleAdd = () => {
    setEditingMaterial(null)
    setForm({ code: '', name: '', spec: '', category: 'RAW', customerId: '', unit: '', stockUnit: '', useDualUnit: false, valuationUnit: '', conversionRate: 1, conversionNote: '', costingMethod: 'WEIGHTED_AVERAGE' })
    setShowModal(true)
  }

  const handleViewDetail = async (material: Material) => {
    try {
      const res = await fetch(`/api/materials?keyword=${encodeURIComponent(material.code)}&pageSize=20`)
      const data = await res.json()
      const freshMaterial = (data.data || []).find((item: Material) => item.id === material.id)
      setDetailMaterial(freshMaterial || material)
    } catch (error) {
      setDetailMaterial(material)
    }
  }

  const handleEditFromDetail = () => {
    if (!detailMaterial) return
    const material = detailMaterial
    setDetailMaterial(null)
    handleEdit(material)
  }

  const handleAttachmentMessage = (message: string) => {
    onMessage(message)
    fetchMaterials()
  }

  useEffect(() => {
    if (!onToolbarChange) return

    onToolbarChange(
      <ResponsiveToolbarActions>
        <StatusCheckboxFilter
          options={materialCategoryFilterOptions}
          value={selectedCategories}
          onChange={setSelectedCategories}
          allLabel="全部分类"
        />
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索物料名称或编码"
          className="w-56 px-4 py-2 border border-gray-200 rounded-lg text-sm"
        />
        <select
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          className="w-48 px-4 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">全部客户</option>
          <option value="__UNASSIGNED__">通用/未绑定</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>{customer.name}</option>
          ))}
        </select>
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition"
        >
          + 新增物料
        </button>
      </ResponsiveToolbarActions>
    )

    return () => onToolbarChange(null)
  }, [onToolbarChange, selectedCategories, keyword, customerFilter, customers])

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions>
          <StatusCheckboxFilter
            options={materialCategoryFilterOptions}
            value={selectedCategories}
            onChange={setSelectedCategories}
            allLabel="全部分类"
          />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索物料名称或编码"
            className="w-56 px-4 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="w-48 px-4 py-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">全部客户</option>
            <option value="__UNASSIGNED__">通用/未绑定</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.name}</option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition"
          >
            + 新增物料
          </button>
        </ResponsiveToolbarActions>
      </TopBarPortal>
      <div className="bg-white rounded-lg shadow p-6">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">图片</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">物料编码</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">物料名称</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">分类</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">归属客户</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">规格</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">库存单位</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">核算单位</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">库存</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">核算库存</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">创建时间</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {materials.map((material) => (
              <tr key={material.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleViewDetail(material)}
                    className="h-12 w-12 overflow-hidden rounded border border-gray-200 bg-gray-50"
                    title={material.primaryImage?.note || '查看物料详情'}
                  >
                    {material.primaryImage ? (
                      <img src={material.primaryImage.url} alt={material.primaryImage.note || material.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs text-gray-400">暂无</span>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3 font-mono text-sm text-blue-600">{material.code}</td>
                <td className="px-4 py-3 font-medium text-sm">{material.name}</td>
                <td className="px-4 py-3 text-sm">{materialCategoryLabels[material.category || 'RAW'] || '其他'}</td>
                <td className="px-4 py-3 text-sm">{material.customer ? `${material.customer.name} (${material.customer.code})` : '通用/未绑定'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{material.spec || '-'}</td>
                <td className="px-4 py-3 text-sm">{material.stockUnit || material.unit}</td>
                <td className="px-4 py-3 text-sm">
                  <div>{material.valuationUnit || material.unit}</div>
                  <div className="text-xs text-gray-500">1 {material.stockUnit || material.unit} = {material.conversionRate || 1} {material.valuationUnit || material.unit}</div>
                  <div className="text-xs text-gray-500">成本法：{material.costingMethod === 'FIFO' ? '先入先出' : '移动加权平均'}</div>
                </td>
                <td className="px-4 py-3 text-sm">{material.stock?.qty || 0} {material.stockUnit || material.unit}</td>
                <td className="px-4 py-3 text-sm text-green-600">{material.stock?.valuationQty || 0} {material.valuationUnit || material.unit}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(material.createdAt).toLocaleString('zh-CN')}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleViewDetail(material)}
                    className="px-3 py-1 text-gray-700 border border-gray-300 rounded text-xs hover:bg-gray-50 transition"
                  >
                    查看详情
                  </button>
                  <button
                    onClick={() => handleArchive(material.id)}
                    className="ml-2 px-3 py-1 text-amber-700 border border-amber-300 rounded text-xs hover:bg-amber-50 transition"
                  >
                    归档
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {materials.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>暂无物料</p>
          <button
            onClick={handleAdd}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
          >
            创建第一个物料
          </button>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">{editingMaterial ? '编辑物料' : '新增物料'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">&times;</button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">物料编码 *</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                  placeholder="如：MAT-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">物料名称 *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                  placeholder="如：GCr15 轴承钢"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">规格</label>
                <input
                  type="text"
                  value={form.spec}
                  onChange={(e) => setForm({ ...form, spec: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                  placeholder="如：Φ30mm 圆钢"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">物料分类</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                >
                  {materialCategoryOptions.map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">归属客户</label>
                <select
                  value={form.customerId}
                  onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                >
                  <option value="">通用/未绑定客户</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name} ({customer.code})</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">客户筛选只匹配直接绑定的客户专用物料，不展开 BOM 关联辅料。</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">库存/领料单位 *</label>
                <input
                  type="text"
                  value={form.stockUnit}
                  onChange={(e) => setForm({ ...form, stockUnit: e.target.value, unit: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                  placeholder="如：根、米、件、kg"
                />
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.useDualUnit}
                  onChange={(e) => setForm({
                    ...form,
                    useDualUnit: e.target.checked,
                    valuationUnit: e.target.checked ? form.valuationUnit : '',
                    conversionRate: e.target.checked ? form.conversionRate : 1,
                    conversionNote: e.target.checked ? form.conversionNote : '',
                  })}
                  className="h-4 w-4"
                />
                启用双单位制
              </label>
              {form.useDualUnit && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">计价/核算单位 *</label>
                    <input
                      type="text"
                      value={form.valuationUnit}
                      onChange={(e) => setForm({ ...form, valuationUnit: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                      placeholder="如：kg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">换算系数 *</label>
                    <input
                      type="number"
                      step="0.0001"
                      min={0}
                      value={form.conversionRate || ''}
                      onChange={(e) => setForm({ ...form, conversionRate: Number(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                      placeholder="例如：1 根 = 2.35 kg，则填 2.35"
                    />
                    <p className="mt-1 text-xs text-gray-500">含义：1 {form.stockUnit || '库存单位'} = {form.conversionRate || 0} {form.valuationUnit || '核算单位'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">换算说明</label>
                    <input
                      type="text"
                      value={form.conversionNote}
                      onChange={(e) => setForm({ ...form, conversionNote: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                      placeholder="如：按理论重量，实际称重可在来料单修正"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">成本核算方法</label>
                <select
                  value={form.costingMethod}
                  onChange={(e) => setForm({ ...form, costingMethod: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                >
                  <option value="WEIGHTED_AVERAGE">移动加权平均</option>
                  <option value="FIFO">先入先出 FIFO</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">当前已记录入库成本层，FIFO 后续按成本层扣减。</p>
              </div>
            </div>
            <div className="flex gap-3 p-4 border-t">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                取消
              </button>
              <button onClick={handleSubmit} disabled={loading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {loading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailMaterial && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b">
              <h3 className="text-base font-semibold text-gray-900">物料详情</h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleEditFromDetail}
                  className="px-3 py-2 text-sm text-blue-700 border border-blue-300 rounded-md hover:bg-blue-50"
                >
                  编辑资料
                </button>
                <button
                  onClick={() => setDetailMaterial(null)}
                  className="h-9 w-9 flex-shrink-0 text-2xl text-gray-400 hover:text-gray-700"
                  aria-label="关闭详情"
                >
                  &times;
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid gap-6 md:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.35fr)]">
                <a
                  href={detailMaterial.primaryImage?.url}
                  target={detailMaterial.primaryImage ? '_blank' : undefined}
                  rel={detailMaterial.primaryImage ? 'noreferrer' : undefined}
                  className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-gray-100"
                >
                  {detailMaterial.primaryImage ? (
                    <img
                      src={detailMaterial.primaryImage.url}
                      alt={detailMaterial.primaryImage.note || detailMaterial.name}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-sm text-gray-400">暂无物料图片</span>
                  )}
                </a>

                <div className="min-w-0">
                  <div className="border-b border-gray-200 pb-5">
                    <div className="font-mono text-sm text-blue-700">{detailMaterial.code}</div>
                    <h2 className="mt-2 text-2xl font-semibold text-gray-900">{detailMaterial.name}</h2>
                    <p className="mt-2 text-sm text-gray-600">规格：{detailMaterial.spec || '-'}</p>
                    <p className="mt-1 text-sm text-gray-600">分类：{materialCategoryLabels[detailMaterial.category || 'RAW'] || '其他'}</p>
                    <p className="mt-1 text-sm text-gray-600">归属客户：{detailMaterial.customer ? `${detailMaterial.customer.name} (${detailMaterial.customer.code})` : '通用/未绑定'}</p>
                  </div>

                  <dl className="grid grid-cols-3 border-b border-gray-200 py-5">
                    <div>
                      <dt className="text-xs text-gray-500">当前库存</dt>
                      <dd className="mt-2 text-xl font-semibold text-gray-900">{detailMaterial.stock?.qty || 0} {detailMaterial.stockUnit || detailMaterial.unit}</dd>
                    </div>
                    <div className="border-l border-gray-200 pl-5">
                      <dt className="text-xs text-gray-500">已占用</dt>
                      <dd className="mt-2 text-xl font-semibold text-gray-900">{detailMaterial.stock?.reservedQty || 0} {detailMaterial.stockUnit || detailMaterial.unit}</dd>
                    </div>
                    <div className="border-l border-gray-200 pl-5">
                      <dt className="text-xs text-gray-500">可用库存</dt>
                      <dd className="mt-2 text-xl font-semibold text-green-700">{detailMaterial.stock?.availableQty || 0} {detailMaterial.stockUnit || detailMaterial.unit}</dd>
                    </div>
                  </dl>

                  <dl className="grid grid-cols-2 gap-5 pt-5">
                    <div>
                      <dt className="text-xs text-gray-500">计价/核算单位</dt>
                      <dd className="mt-1 text-sm font-medium text-gray-900">{detailMaterial.valuationUnit}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">核算库存</dt>
                      <dd className="mt-1 text-sm font-medium text-gray-900">{detailMaterial.stock?.valuationQty || 0} {detailMaterial.valuationUnit}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">换算关系</dt>
                      <dd className="mt-1 text-sm font-medium text-gray-900">1 {detailMaterial.stockUnit || detailMaterial.unit} = {detailMaterial.conversionRate || 1} {detailMaterial.valuationUnit}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">成本方法</dt>
                      <dd className="mt-1 text-sm font-medium text-gray-900">{detailMaterial.costingMethod === 'FIFO' ? '先入先出 FIFO' : '移动加权平均'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">当前平均成本</dt>
                      <dd className="mt-1 text-sm font-medium text-gray-900">
                        ¥{(detailMaterial.stock?.valuationUnitCost || 0).toFixed(4)} / {detailMaterial.valuationUnit}
                        <span className="ml-2 text-gray-500">¥{(detailMaterial.stock?.stockUnitCost || 0).toFixed(4)} / {detailMaterial.stockUnit || detailMaterial.unit}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">创建时间</dt>
                      <dd className="mt-1 text-sm text-gray-900">{new Date(detailMaterial.createdAt).toLocaleString('zh-CN')}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              <AttachmentPanel
                ownerType="MATERIAL"
                ownerId={detailMaterial.id}
                title="图片资料"
                variant="image"
                documentType="MATERIAL_IMAGE"
                layout="gallery"
                allowCover
                onMessage={handleAttachmentMessage}
              />
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  )
}
