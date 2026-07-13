'use client'

import { ReactNode, useState, useEffect } from 'react'
import AttachmentPanel from './AttachmentPanel'
import StatusCheckboxFilter, { getStatusQuery } from './StatusCheckboxFilter'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'

interface Product {
  id: string
  sku: string
  name: string
  category: string
  unit: string
}

interface ReturnOrder {
  id: string
  returnNo: string
  shipmentId?: string
  productId: string
  qty: number
  reason: string
  status: string
  note?: string
  createdAt: string
  processedAt?: string
  product: { id: string; name: string; sku: string }
  shipment?: { id: string; shipmentNo: string } | null
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700',
  PROCESSED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
}

const statusLabels: Record<string, string> = {
  PENDING: '待处理',
  PROCESSED: '已处理',
  REJECTED: '已拒绝',
}

const statusOptions = [
  { value: 'PENDING', label: '待处理' },
  { value: 'PROCESSED', label: '已处理' },
  { value: 'REJECTED', label: '已拒绝' },
]

export default function ReturnPage({
  onMessage,
  onToolbarChange,
}: {
  onMessage: (msg: string) => void
  onToolbarChange?: (actions: ReactNode | null) => void
}) {
  const [returns, setReturns] = useState<ReturnOrder[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState(statusOptions.map((option) => option.value))
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const [form, setForm] = useState({
    productId: '',
    qty: 0,
    reason: '',
    note: '',
  })

  useEffect(() => {
    fetchReturns()
    fetchProducts()
  }, [selectedStatuses])

  const fetchReturns = async () => {
    setLoading(true)
    try {
      const query = getStatusQuery(selectedStatuses, statusOptions)
      const url = query ? `/api/returns?${query}` : '/api/returns'
      const res = await fetch(url)
      const data = await res.json()
      setReturns(data.data || [])
    } catch (err) {
      onMessage('获取退货单列表失败')
    }
    setLoading(false)
  }

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products')
      if (res.ok) {
        const data = await res.json()
        setProducts(data.data || [])
      }
    } catch (err) {
      // ignore
    }
  }

  const resetForm = () => {
    setForm({
      productId: '',
      qty: 0,
      reason: '',
      note: '',
    })
  }

  const handleSubmit = async () => {
    if (!form.productId || form.qty <= 0 || !form.reason) {
      onMessage('请选择产品并填写数量和退货原因')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: form.productId,
          qty: form.qty,
          reason: form.reason,
          note: form.note || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        onMessage(`退货单创建成功：${data.data.returnNo}`)
        setShowModal(false)
        resetForm()
        await fetchReturns()
      } else {
        onMessage(data.error || '创建退货单失败')
      }
    } catch (err) {
      onMessage('创建退货单失败')
    }
    setLoading(false)
  }

  const handleAction = async (id: string, action: 'process' | 'reject') => {
    setLoading(true)
    try {
      const res = await fetch(`/api/returns/${id}/${action}`, { method: 'PATCH' })
      const data = await res.json()
      if (res.ok) {
        onMessage(data.message || '操作成功')
        await fetchReturns()
      } else {
        onMessage(data.error || '操作失败')
      }
    } catch (err) {
      onMessage('操作失败')
    }
    setLoading(false)
  }


  useEffect(() => {
    if (!onToolbarChange) return

    onToolbarChange(
      <ResponsiveToolbarActions>
        <StatusCheckboxFilter options={statusOptions} value={selectedStatuses} onChange={setSelectedStatuses} />
        <button
          onClick={() => {
            resetForm()
            setShowModal(true)
          }}
          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition"
        >
          新增退货单
        </button>
      </ResponsiveToolbarActions>
    )

    return () => onToolbarChange(null)
  }, [onToolbarChange, selectedStatuses])

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        {returns.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-4xl mb-4">↩️</p>
            <p>暂无退货单</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">退货单号</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">关联发货单</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">产品</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">数量</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">退货原因</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">状态</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">创建时间</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">原始单据</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {returns.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-blue-600">{item.returnNo}</td>
                    <td className="px-4 py-3 font-mono text-sm">
                      {item.shipment?.shipmentNo || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.product?.name}</div>
                      <div className="text-xs text-gray-500">{item.product?.sku}</div>
                    </td>
                    <td className="px-4 py-3">{item.qty}</td>
                    <td className="px-4 py-3 text-sm">{item.reason}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[item.status]}`}>
                        {statusLabels[item.status] || item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(item.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <AttachmentPanel ownerType="RETURN_ORDER" ownerId={item.id} compact onMessage={onMessage} />
                    </td>
                    <td className="px-4 py-3">
                      {item.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAction(item.id, 'process')}
                            disabled={loading}
                            className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition disabled:opacity-50"
                          >
                            处理
                          </button>
                          <button
                            onClick={() => handleAction(item.id, 'reject')}
                            disabled={loading}
                            className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition disabled:opacity-50"
                          >
                            拒绝
                          </button>
                        </div>
                      )}
                      {item.status !== 'PENDING' && (
                        <span className="text-xs text-gray-400">无操作</span>
                      )}
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
              <h3 className="text-lg font-semibold">新增退货单</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">产品</label>
                <select
                  value={form.productId}
                  onChange={(e) => setForm({ ...form, productId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">请选择产品</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">数量</label>
                <input
                  type="number"
                  value={form.qty || ''}
                  onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })}
                  min={1}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">退货原因</label>
                <textarea
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  rows={3}
                  placeholder="请填写退货原因"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
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
