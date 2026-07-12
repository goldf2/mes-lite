'use client'

import { useState, useEffect } from 'react'
import AttachmentPanel from './AttachmentPanel'

interface Supplier {
  id: string
  code: string
  name: string
  contact?: string
  phone?: string
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
  material: { id: string; code: string; name: string; spec?: string; unit: string; stockUnit: string; valuationUnit: string; conversionRate: number }
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700',
  RECEIVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
}

const statusLabels: Record<string, string> = {
  PENDING: '待收货',
  RECEIVED: '已收货',
  REJECTED: '已拒收',
}

export default function MaterialInPage({ onMessage }: { onMessage: (msg: string) => void }) {
  const [materialIns, setMaterialIns] = useState<MaterialIn[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)

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
    fetchMaterials()
  }, [statusFilter])

  const fetchMaterialIns = async () => {
    setLoading(true)
    try {
      const url = statusFilter ? `/api/material-ins?status=${statusFilter}` : '/api/material-ins'
      const res = await fetch(url)
      const data = await res.json()
      setMaterialIns(data.data || [])
    } catch (err) {
      onMessage('获取来料单列表失败')
    }
    setLoading(false)
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
    if (!form.supplierId || !form.materialId || form.qty <= 0 || form.valuationQty <= 0) {
      onMessage('请选择供应商和物料，并输入有效长度/件数和实际重量')
      return
    }
    setLoading(true)
    try {
      const selectedMaterial = materials.find((m) => m.id === form.materialId)
      const res = await fetch('/api/material-ins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: form.supplierId,
          materialId: form.materialId,
          qty: form.qty,
          unit: selectedMaterial?.stockUnit || selectedMaterial?.unit || '个',
          valuationQty: form.valuationQty,
          valuationUnit: selectedMaterial?.valuationUnit,
          unitPrice: form.unitPrice,
          priceBasis: form.priceBasis,
          batchNo: form.batchNo || undefined,
          receivedBy: form.receivedBy || undefined,
          note: form.note || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        onMessage(`来料单创建成功：${data.data.inboundNo}`)
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
  const actualConversionRate = form.qty > 0 && form.valuationQty > 0 ? Number((form.valuationQty / form.qty).toFixed(6)) : 0
  const priceUnitLabel = form.priceBasis === 'STOCK'
    ? selectedMaterial?.stockUnit || selectedMaterial?.unit || '库存单位'
    : selectedMaterial?.valuationUnit || 'kg'
  const totalAmountPreview = Number(((form.priceBasis === 'STOCK' ? form.qty : form.valuationQty) * form.unitPrice).toFixed(4))
  const valuationUnitCostPreview = form.valuationQty > 0 ? Number((totalAmountPreview / form.valuationQty).toFixed(6)) : 0
  const stockUnitCostPreview = form.qty > 0 ? Number((totalAmountPreview / form.qty).toFixed(6)) : 0

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

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">来料管理</h2>
          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">全部状态</option>
              <option value="PENDING">待收货</option>
              <option value="RECEIVED">已收货</option>
              <option value="REJECTED">已拒收</option>
            </select>
            <button
              onClick={() => {
                resetForm()
                setShowModal(true)
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition"
            >
              新增来料单
            </button>
          </div>
        </div>

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
                    </td>
                    <td className="px-4 py-3">{item.qty} {item.unit}</td>
                    <td className="px-4 py-3">
                      <div>{item.valuationQty} {item.valuationUnit}</div>
                      <div className="text-xs text-gray-500">1 {item.unit} = {item.conversionRate} {item.valuationUnit}</div>
                    </td>
                    <td className="px-4 py-3">¥{item.unitPrice.toFixed(4)} / {item.priceUnit || item.valuationUnit}</td>
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
                        {item.status !== 'PENDING' && (
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
              <h3 className="text-lg font-semibold">新增来料单</h3>
              <button
                onClick={() => setShowModal(false)}
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
                    setForm({
                      ...form,
                      materialId: e.target.value,
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
              <div className="grid grid-cols-2 gap-4">
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">重量 {selectedMaterial ? `(${selectedMaterial.valuationUnit})` : ''}</label>
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
                      参考：按物料默认换算约 {referenceValuationQty} {selectedMaterial.valuationUnit}，实际重量以录入为准
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">计价方式</label>
                  <select
                    value={form.priceBasis}
                    onChange={(e) => setForm({ ...form, priceBasis: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="VALUATION">按重量计价</option>
                    <option value="STOCK">按长度/件数计价</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">报价单价（元 / {priceUnitLabel}）</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.unitPrice || ''}
                    onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })}
                    min={0}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
                <div>报价单价：¥{(form.unitPrice || 0).toFixed(4)} / {priceUnitLabel}</div>
                <div className="mt-1">每 {selectedMaterial?.valuationUnit || 'kg'} 成本：¥{valuationUnitCostPreview.toFixed(4)}</div>
                <div className="mt-1">每 {selectedMaterial?.stockUnit || '件/米/根'} 成本：¥{stockUnitCostPreview.toFixed(4)}</div>
                <div className="mt-1">总金额：¥{totalAmountPreview.toFixed(2)}</div>
                <div className="mt-1">本批实际换算：{actualConversionRate || 0} {selectedMaterial?.valuationUnit || 'kg'} / {selectedMaterial?.stockUnit || '库存单位'}</div>
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
                  {loading ? '提交中...' : '提交'}
                </button>
                <button
                  onClick={() => setShowModal(false)}
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
  )
}
