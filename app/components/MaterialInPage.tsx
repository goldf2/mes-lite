'use client'

import { ReactNode, useState, useEffect } from 'react'
import AttachmentPanel from './AttachmentPanel'
import StatusCheckboxFilter, { getStatusQuery } from './StatusCheckboxFilter'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import TopBarPortal from './TopBarPortal'

interface Supplier {
  id: string
  code: string
  name: string
  contact?: string
  phone?: string
}

interface Customer {
  id: string
  code: string
  name: string
}

interface Material {
  id: string
  code: string
  name: string
  spec?: string
  unit: string
  stockUnit: string
  valuationUnit: string
  conversionRate: number
  customerId?: string | null
  customer?: { id: string; code: string; name: string } | null
}

interface MaterialIn {
  id: string
  inboundNo: string
  supplierId: string
  materialId: string
  qty: number
  unit: string
  valuationQty: number
  valuationUnit: string
  conversionRate: number
  stockUnitCost: number
  valuationUnitCost: number
  unitPrice: number
  priceBasis: string
  priceUnit?: string
  totalAmount: number
  batchNo?: string
  status: string
  inboundDate: string
  receivedBy?: string
  note?: string
  supplier: { id: string; code: string; name: string }
  material: { id: string; code: string; name: string; spec?: string; unit: string; stockUnit: string; valuationUnit: string; conversionRate: number; customerId?: string | null; customer?: { id: string; code: string; name: string } | null }
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700',
  RECEIVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  REVERSED: 'bg-orange-100 text-orange-700',
}

const statusLabels: Record<string, string> = {
  PENDING: '待收货',
  RECEIVED: '已收货',
  REJECTED: '已拒收',
  REVERSED: '已红冲',
}

const statusOptions = [
  { value: 'PENDING', label: '待收货' },
  { value: 'RECEIVED', label: '已收货' },
  { value: 'REJECTED', label: '已拒收' },
  { value: 'REVERSED', label: '已红冲' },
]

export default function MaterialInPage({
  onMessage,
  onToolbarChange,
}: {
  onMessage: (msg: string) => void
  onToolbarChange?: (actions: ReactNode | null) => void
}) {
  const [materialIns, setMaterialIns] = useState<MaterialIn[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState(statusOptions.map((option) => option.value))
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<MaterialIn | null>(null)

  const [form, setForm] = useState({
    supplierId: '',
    materialId: '',
    qty: 0,
    valuationQty: 0,
    unitPrice: 0,
    priceBasis: 'VALUATION',
    batchNo: '',
    receivedBy: '',
    note: '',
  })

  useEffect(() => {
    fetchMaterialIns()
    fetchSuppliers()
    fetchCustomers()
    fetchMaterials()
  }, [selectedStatuses, selectedSupplierId, selectedCustomerId])

  const fetchMaterialIns = async () => {
    setLoading(true)
    try {
      const query = getStatusQuery(selectedStatuses, statusOptions)
      const params = new URLSearchParams(query)
      if (selectedSupplierId) params.set('supplierId', selectedSupplierId)
      if (selectedCustomerId) params.set('customerId', selectedCustomerId)
      const url = params.toString() ? `/api/material-ins?${params.toString()}` : '/api/material-ins'
      const res = await fetch(url)
      const data = await res.json()
      setMaterialIns(data.data || [])
    } catch (err) {
      onMessage('获取来料单列表失败')
    }
    setLoading(false)
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

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('/api/suppliers')
      if (res.ok) {
        const data = await res.json()
        setSuppliers(data.data || [])
      }
    } catch (err) {
      // ignore
    }
  }

  const fetchMaterials = async () => {
    try {
      const res = await fetch('/api/materials')
      if (res.ok) {
        const data = await res.json()
        setMaterials(data.data || [])
      }
    } catch (err) {
      // ignore
    }
  }

  const resetForm = () => {
    setEditingItem(null)
    setForm({
      supplierId: '',
      materialId: '',
      qty: 0,
      valuationQty: 0,
      unitPrice: 0,
      priceBasis: 'VALUATION',
      batchNo: '',
      receivedBy: '',
      note: '',
    })
  }

  const handleSubmit = async () => {
    if (!form.supplierId || !form.materialId || form.qty <= 0) {
      onMessage('请选择供应商和物料，并输入有效长度/件数')
      return
    }
    setLoading(true)
    try {
      const selectedMaterial = materials.find((m) => m.id === form.materialId)
      const submitStockUnit = selectedMaterial?.stockUnit || selectedMaterial?.unit || '个'
      const submitValuationUnit = selectedMaterial?.valuationUnit || submitStockUnit
      const submitUsesDualUnit = Boolean(
        selectedMaterial && (submitStockUnit !== submitValuationUnit || Number(selectedMaterial.conversionRate || 1) !== 1)
      )
      const res = await fetch(editingItem ? `/api/material-ins/${editingItem.id}` : '/api/material-ins', {
        method: editingItem ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: form.supplierId,
          materialId: form.materialId,
          qty: form.qty,
          unit: submitStockUnit,
          valuationQty: submitUsesDualUnit && form.valuationQty > 0 ? form.valuationQty : undefined,
          valuationUnit: submitValuationUnit,
          unitPrice: form.unitPrice,
          priceBasis: submitUsesDualUnit ? form.priceBasis : 'STOCK',
          batchNo: form.batchNo || undefined,
          receivedBy: form.receivedBy || undefined,
          note: form.note || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        onMessage(editingItem ? `来料单已修改：${data.data.inboundNo}` : `来料单创建成功：${data.data.inboundNo}`)
        setShowModal(false)
        resetForm()
        await fetchMaterialIns()
      } else {
        onMessage(data.error || '创建来料单失败')
      }
    } catch (err) {
      onMessage('创建来料单失败')
    }
    setLoading(false)
  }

  const selectedMaterial = materials.find((material) => material.id === form.materialId)
  const referenceValuationQty = selectedMaterial && form.qty > 0 ? Number((form.qty * (selectedMaterial.conversionRate || 1)).toFixed(6)) : 0
  const stockUnitLabel = selectedMaterial?.stockUnit || selectedMaterial?.unit || '库存单位'
  const valuationUnitLabel = selectedMaterial?.valuationUnit || 'kg'
  const materialUsesDualUnit = Boolean(selectedMaterial && (stockUnitLabel !== valuationUnitLabel || Number(selectedMaterial.conversionRate || 1) !== 1))
  const previewPriceBasis = materialUsesDualUnit ? form.priceBasis : 'STOCK'
  const effectiveValuationQty = materialUsesDualUnit
    ? (form.valuationQty > 0 ? form.valuationQty : referenceValuationQty)
    : form.qty
  const actualConversionRate = form.qty > 0 && effectiveValuationQty > 0 ? Number((effectiveValuationQty / form.qty).toFixed(6)) : 0
  const totalAmountPreview = Number(((previewPriceBasis === 'STOCK' ? form.qty : effectiveValuationQty) * form.unitPrice).toFixed(4))
  const valuationUnitCostPreview = effectiveValuationQty > 0 ? Number((totalAmountPreview / effectiveValuationQty).toFixed(6)) : 0
  const stockUnitCostPreview = form.qty > 0 ? Number((totalAmountPreview / form.qty).toFixed(6)) : 0
  const valuationPriceDisplay = previewPriceBasis === 'VALUATION' ? form.unitPrice : valuationUnitCostPreview
  const stockPriceDisplay = previewPriceBasis === 'STOCK' ? form.unitPrice : stockUnitCostPreview

  const handleReceive = async (id: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/material-ins/${id}/receive`, { method: 'PATCH' })
      const data = await res.json()
      if (res.ok) {
        onMessage(data.message || '收货成功')
        await fetchMaterialIns()
      } else {
        onMessage(data.error || '收货失败')
      }
    } catch (err) {
      onMessage('收货失败')
    }
    setLoading(false)
  }

  const handleEdit = (item: MaterialIn) => {
    if (item.status !== 'PENDING') {
      onMessage('只有待收货来料单可以修改')
      return
    }

    setEditingItem(item)
    setForm({
      supplierId: item.supplierId,
      materialId: item.materialId,
      qty: Number(item.qty),
      valuationQty: Number(item.valuationQty),
      unitPrice: Number(item.unitPrice),
      priceBasis: item.priceBasis || 'VALUATION',
      batchNo: item.batchNo || '',
      receivedBy: item.receivedBy || '',
      note: item.note || '',
    })
    setShowModal(true)
  }

  const handleReject = async (id: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/material-ins/${id}/reject`, { method: 'PATCH' })
      const data = await res.json()
      if (res.ok) {
        onMessage(data.message || '拒收成功')
        await fetchMaterialIns()
      } else {
        onMessage(data.error || '拒收失败')
      }
    } catch (err) {
      onMessage('拒收失败')
    }
    setLoading(false)
  }

  const handleReverse = async (item: MaterialIn) => {
    const reason = window.prompt(`请输入红冲来料单 ${item.inboundNo} 的原因`)
    if (!reason) return

    setLoading(true)
    try {
      const res = await fetch(`/api/material-ins/${item.id}/reverse`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const data = await res.json()
      if (res.ok) {
        onMessage(data.message || '红冲成功')
        await fetchMaterialIns()
      } else {
        onMessage(data.error || '红冲失败')
      }
    } catch (err) {
      onMessage('红冲失败')
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!onToolbarChange) return

    onToolbarChange(
      <ResponsiveToolbarActions
        filters={(
          <>
            <StatusCheckboxFilter
              options={statusOptions}
              value={selectedStatuses}
              onChange={setSelectedStatuses}
            />
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-48 px-4 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">全部客户</option>
              <option value="__UNASSIGNED__">通用/未绑定</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="w-48 px-4 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">全部供应商</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </>
        )}
        actions={(
          <button
            onClick={() => {
              resetForm()
              setShowModal(true)
            }}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition"
          >
            新增来料单
          </button>
        )}
      />
    )

    return () => onToolbarChange(null)
  }, [onToolbarChange, selectedStatuses, selectedCustomerId, selectedSupplierId, customers, suppliers])

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          filters={(
            <>
              <StatusCheckboxFilter
                options={statusOptions}
                value={selectedStatuses}
                onChange={setSelectedStatuses}
              />
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-48 px-4 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="">全部客户</option>
                <option value="__UNASSIGNED__">通用/未绑定</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-48 px-4 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="">全部供应商</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </>
          )}
          actions={(
            <button
              onClick={() => {
                resetForm()
                setShowModal(true)
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition"
            >
              新增来料单
            </button>
          )}
        />
      </TopBarPortal>
      <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        {materialIns.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-4xl mb-4">📦</p>
            <p>暂无来料单</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">入库单号</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">供应商</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">物料</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">库存数量</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">核算数量</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">报价单价</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">每kg成本</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">每库存单位成本</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">总金额</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">批次</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">状态</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">入库日期</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">原始单据</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {materialIns.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-blue-600">{item.inboundNo}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.supplier?.name}</div>
                      <div className="text-xs text-gray-500">{item.supplier?.code}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.material?.name}</div>
                      <div className="text-xs text-gray-500">{item.material?.code}</div>
                      <div className="text-xs text-gray-500">客户：{item.material?.customer?.name || '通用/未绑定'}</div>
                    </td>
                    <td className="px-4 py-3">{item.qty} {item.unit}</td>
                    <td className="px-4 py-3">
                      <div>{item.valuationQty} {item.valuationUnit}</div>
                      <div className="text-xs text-gray-500">1 {item.unit} = {item.conversionRate} {item.valuationUnit}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>¥{item.unitPrice.toFixed(4)} / {item.priceUnit || item.valuationUnit}</div>
                      <div className="text-xs text-gray-500">{item.priceBasis === 'STOCK' ? '按数量/长度报价' : '按重量报价'}</div>
                    </td>
                    <td className="px-4 py-3">¥{(item.valuationUnitCost || item.unitPrice).toFixed(4)} / {item.valuationUnit}</td>
                    <td className="px-4 py-3">¥{item.stockUnitCost.toFixed(4)} / {item.unit}</td>
                    <td className="px-4 py-3 font-medium">¥{item.totalAmount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm">{item.batchNo || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[item.status]}`}>
                        {statusLabels[item.status] || item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(item.inboundDate).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <AttachmentPanel ownerType="MATERIAL_IN" ownerId={item.id} compact onMessage={onMessage} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {item.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => handleEdit(item)}
                              disabled={loading}
                              className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition disabled:opacity-50"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => handleReceive(item.id)}
                              disabled={loading}
                              className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition disabled:opacity-50"
                            >
                              收货
                            </button>
                            <button
                              onClick={() => handleReject(item.id)}
                              disabled={loading}
                              className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition disabled:opacity-50"
                            >
                              拒收
                            </button>
                          </>
                        )}
                        {item.status === 'RECEIVED' && (
                          <button
                            onClick={() => handleReverse(item)}
                            disabled={loading}
                            className="px-3 py-1 bg-orange-600 text-white rounded text-xs hover:bg-orange-700 transition disabled:opacity-50"
                          >
                            红冲
                          </button>
                        )}
                        {item.status !== 'PENDING' && item.status !== 'RECEIVED' && (
                          <span className="text-xs text-gray-400">无操作</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editingItem ? `编辑来料单 ${editingItem.inboundNo}` : '新增来料单'}</h3>
              <button
                onClick={() => {
                  setShowModal(false)
                  resetForm()
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">供应商</label>
                <select
                  value={form.supplierId}
                  onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">请选择供应商</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">物料</label>
                <select
                  value={form.materialId}
                  onChange={(e) => {
                    const material = materials.find((item) => item.id === e.target.value)
                    const nextStockUnit = material?.stockUnit || material?.unit
                    const nextValuationUnit = material?.valuationUnit || material?.unit
                    const nextUsesDualUnit = Boolean(material && (nextStockUnit !== nextValuationUnit || Number(material.conversionRate || 1) !== 1))
                    setForm({
                      ...form,
                      materialId: e.target.value,
                      valuationQty: 0,
                      priceBasis: nextUsesDualUnit ? form.priceBasis : 'STOCK',
                    })
                  }}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">请选择物料</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.code}){m.spec ? ` - ${m.spec}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className={`grid gap-4 ${materialUsesDualUnit ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">长度/件数 {selectedMaterial ? `(${selectedMaterial.stockUnit || selectedMaterial.unit})` : ''}</label>
                  <input
                    type="number"
                    value={form.qty || ''}
                    onChange={(e) => {
                      const qty = Number(e.target.value)
                      setForm({
                        ...form,
                        qty,
                      })
                    }}
                    min={0}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                {materialUsesDualUnit && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">实际核算数量/重量（可选）{selectedMaterial ? `(${selectedMaterial.valuationUnit})` : ''}</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={form.valuationQty || ''}
                      onChange={(e) => setForm({ ...form, valuationQty: Number(e.target.value) })}
                      min={0}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {selectedMaterial && (
                      <p className="mt-1 text-xs text-gray-500">
                        不填则按默认换算：约 {referenceValuationQty} {selectedMaterial.valuationUnit}；称重后可填写实际值覆盖。
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div>
                <div className="mb-2 text-sm font-medium text-gray-700">材料单价</div>
                {materialUsesDualUnit ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">重量单价（元 / {valuationUnitLabel}）</label>
                      <input
                        type="number"
                        step="0.01"
                        value={valuationPriceDisplay || ''}
                        onChange={(e) => setForm({ ...form, priceBasis: 'VALUATION', unitPrice: Number(e.target.value) })}
                        min={0}
                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                          previewPriceBasis === 'VALUATION' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50'
                        }`}
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        按重量报价时填写这里，例如供应商按 kg 结算；右侧数量单价由系统换算。
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">数量/长度单价（元 / {stockUnitLabel}）</label>
                      <input
                        type="number"
                        step="0.01"
                        value={stockPriceDisplay || ''}
                        onChange={(e) => setForm({ ...form, priceBasis: 'STOCK', unitPrice: Number(e.target.value) })}
                        min={0}
                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                          previewPriceBasis === 'STOCK' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50'
                        }`}
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        按数量或长度报价时填写这里，例如供应商按根、件、米结算；左侧重量单价由系统换算。
                      </p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">单价（元 / {stockUnitLabel}）</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.unitPrice || ''}
                      onChange={(e) => setForm({ ...form, priceBasis: 'STOCK', unitPrice: Number(e.target.value) })}
                      min={0}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      当前物料未启用双单位制，入库和计价都按 {stockUnitLabel} 记录，不要求填写重量。
                    </p>
                  </div>
                )}
              </div>
              <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
                <div>本次报价依据：{previewPriceBasis === 'STOCK' ? `数量/长度单价，¥${(form.unitPrice || 0).toFixed(4)} / ${stockUnitLabel}` : `重量单价，¥${(form.unitPrice || 0).toFixed(4)} / ${valuationUnitLabel}`}</div>
                {materialUsesDualUnit && (
                  <>
                    <div className="mt-1">换算后重量单价：¥{valuationUnitCostPreview.toFixed(4)} / {valuationUnitLabel}</div>
                    <div className="mt-1">换算后数量/长度单价：¥{stockUnitCostPreview.toFixed(4)} / {stockUnitLabel}</div>
                  </>
                )}
                <div className="mt-1">总金额：¥{totalAmountPreview.toFixed(2)}</div>
                {materialUsesDualUnit && (
                  <div className="mt-1">本批实际换算：{actualConversionRate || 0} {valuationUnitLabel} / {stockUnitLabel}</div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">批次号</label>
                  <input
                    type="text"
                    value={form.batchNo}
                    onChange={(e) => setForm({ ...form, batchNo: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">收货人</label>
                  <input
                    type="text"
                    value={form.receivedBy}
                    onChange={(e) => setForm({ ...form, receivedBy: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">备注</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {loading ? '提交中...' : editingItem ? '保存修改' : '提交'}
                </button>
                <button
                  onClick={() => {
                    setShowModal(false)
                    resetForm()
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  )
}
