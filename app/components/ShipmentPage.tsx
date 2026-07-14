'use client'

import { ReactNode, useState, useEffect } from 'react'
import AttachmentPanel from './AttachmentPanel'
import StatusCheckboxFilter, { getStatusQuery } from './StatusCheckboxFilter'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import TopBarPortal from './TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from './ViewModeToggle'
import useCompactViewport from './useCompactViewport'

interface Product {
  id: string
  sku: string
  name: string
  category: string
  customerId?: string | null
  customer?: { id: string; code: string; name: string } | null
  unit: string
}

interface Customer {
  id: string
  code: string
  name: string
  contact?: string | null
  phone?: string | null
  address?: string | null
}

interface Shipment {
  id: string
  shipmentNo: string
  voucherNo?: string | null
  productId: string
  customerId?: string | null
  qty: number
  unitPrice: number
  totalAmount: number
  customer: string
  customerPhone?: string
  address?: string
  status: string
  shippedAt?: string
  shippedBy?: string
  trackingNo?: string
  note?: string
  createdAt: string
  product: { id: string; name: string; sku: string; customerId?: string | null; customer?: { id: string; code: string; name: string } | null }
  customerRef?: { id: string; code: string; name: string } | null
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700',
  SHIPPED: 'bg-blue-100 text-blue-700',
  DELIVERED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
}

const statusLabels: Record<string, string> = {
  PENDING: '待发货',
  SHIPPED: '已发货',
  DELIVERED: '已签收',
  CANCELLED: '已取消',
}

const statusOptions = [
  { value: 'PENDING', label: '待发货' },
  { value: 'SHIPPED', label: '已发货' },
  { value: 'DELIVERED', label: '已签收' },
  { value: 'CANCELLED', label: '已取消' },
]

export default function ShipmentPage({
  onMessage,
  onToolbarChange,
}: {
  onMessage: (msg: string) => void
  onToolbarChange?: (actions: ReactNode | null) => void
}) {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState(statusOptions.map((option) => option.value))
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.shipment.viewMode', 'list')
  const isCompactViewport = useCompactViewport()
  const effectiveViewMode = isCompactViewport ? 'card' : viewMode

  const [form, setForm] = useState({
    voucherNo: '',
    productId: '',
    customerId: '',
    qty: 0,
    unitPrice: 0,
    customer: '',
    customerPhone: '',
    address: '',
    shippedBy: '',
    note: '',
  })

  useEffect(() => {
    fetchShipments()
    fetchProducts()
    fetchCustomers()
  }, [selectedStatuses, selectedCustomerId])

  const fetchShipments = async () => {
    setLoading(true)
    try {
      const query = getStatusQuery(selectedStatuses, statusOptions)
      const params = new URLSearchParams(query)
      if (selectedCustomerId) params.set('customerId', selectedCustomerId)
      const url = params.toString() ? `/api/shipments?${params.toString()}` : '/api/shipments'
      const res = await fetch(url)
      const data = await res.json()
      setShipments(data.data || [])
    } catch (err) {
      onMessage('获取发货单列表失败')
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

  const resetForm = () => {
    setForm({
      voucherNo: '',
      productId: '',
      customerId: '',
      qty: 0,
      unitPrice: 0,
      customer: '',
      customerPhone: '',
      address: '',
      shippedBy: '',
      note: '',
    })
  }

  const handleSubmit = async () => {
    if (!form.productId || form.qty <= 0 || !form.customer) {
      onMessage('请选择产品并填写数量和客户')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: form.productId,
          voucherNo: form.voucherNo || undefined,
          customerId: form.customerId || undefined,
          qty: form.qty,
          unitPrice: form.unitPrice,
          customer: form.customer,
          customerPhone: form.customerPhone || undefined,
          address: form.address || undefined,
          shippedBy: form.shippedBy || undefined,
          note: form.note || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        onMessage(`发货单创建成功：${data.data.shipmentNo}`)
        setShowModal(false)
        resetForm()
        await fetchShipments()
      } else {
        onMessage(data.error || '创建发货单失败')
      }
    } catch (err) {
      onMessage('创建发货单失败')
    }
    setLoading(false)
  }

  const handleProductChange = (productId: string) => {
    const product = products.find((item) => item.id === productId)
    const customer = product?.customerId ? customers.find((item) => item.id === product.customerId) : null
    setForm({
      ...form,
      productId,
      customerId: product?.customerId || form.customerId,
      customer: customer?.name || form.customer,
      customerPhone: customer?.phone || form.customerPhone,
      address: customer?.address || form.address,
    })
  }

  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find((item) => item.id === customerId)
    setForm({
      ...form,
      customerId,
      customer: customer?.name || '',
      customerPhone: customer?.phone || '',
      address: customer?.address || '',
    })
  }

  const handleAction = async (id: string, action: 'ship' | 'deliver') => {
    setLoading(true)
    try {
      const res = await fetch(`/api/shipments/${id}/${action}`, { method: 'PATCH' })
      const data = await res.json()
      if (res.ok) {
        onMessage(data.message || '操作成功')
        await fetchShipments()
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
      <ResponsiveToolbarActions
        filters={(
          <>
            <StatusCheckboxFilter
              options={statusOptions}
              value={selectedStatuses}
              onChange={setSelectedStatuses}
              storageKey="mes-lite.filters.shipment.status.order"
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
          </>
        )}
        actions={(
          <>
            <div className="hidden sm:block">
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>
            <button
              onClick={() => {
                resetForm()
                setShowModal(true)
              }}
              className="shrink-0 whitespace-nowrap px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700 transition sm:px-4 sm:py-2 sm:text-sm"
            >
              新增
            </button>
          </>
        )}
      />
    )

    return () => onToolbarChange(null)
  }, [onToolbarChange, selectedStatuses, selectedCustomerId, customers, viewMode, setViewMode])

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
                storageKey="mes-lite.filters.shipment.status.order"
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
            </>
          )}
          actions={(
            <>
              <div className="hidden sm:block">
                <ViewModeToggle value={viewMode} onChange={setViewMode} />
              </div>
              <button
                onClick={() => {
                  resetForm()
                  setShowModal(true)
                }}
                className="shrink-0 whitespace-nowrap px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700 transition sm:px-4 sm:py-2 sm:text-sm"
              >
                新增
              </button>
            </>
          )}
        />
      </TopBarPortal>
      <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-3 sm:p-6">
        {shipments.length === 0 ? (
          <div className="text-center py-8 text-gray-500 sm:py-12">
            <p className="text-4xl mb-4">🚚</p>
            <p>暂无发货单</p>
          </div>
        ) : effectiveViewMode === 'card' ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {shipments.map((item) => (
              <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-sm font-semibold text-blue-700">{item.shipmentNo}</div>
                    <div className="mt-1 text-xs text-gray-500">凭据号：{item.voucherNo || '-'}</div>
                    <div className="mt-1 text-xs text-gray-500">{item.shippedAt ? new Date(item.shippedAt).toLocaleString('zh-CN') : '未发货'}</div>
                  </div>
                  <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[item.status]}`}>
                    {statusLabels[item.status] || item.status}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 sm:mt-4">
                  <div>
                    <div className="text-xs text-gray-500">产品</div>
                    <div className="mt-1 font-medium text-gray-900">{item.product?.name}</div>
                    <div className="text-xs text-gray-500">{item.product?.sku}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">客户</div>
                    <div className="mt-1 font-medium text-gray-900">{item.customer}</div>
                    <div className="text-xs text-gray-500">{item.customerRef ? `客户档案：${item.customerRef.name}` : '未绑定客户档案'}</div>
                    {item.customerPhone && <div className="text-xs text-gray-500">{item.customerPhone}</div>}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3">
                  <div className="rounded bg-gray-50 p-2 sm:p-3">
                    <div className="text-xs text-gray-500">数量</div>
                    <div className="mt-1 font-semibold">{item.qty}</div>
                  </div>
                  <div className="rounded bg-gray-50 p-2 sm:p-3">
                    <div className="text-xs text-gray-500">单价</div>
                    <div className="mt-1 font-semibold">¥{item.unitPrice.toFixed(2)}</div>
                  </div>
                  <div className="rounded bg-gray-50 p-2 sm:p-3">
                    <div className="text-xs text-gray-500">金额</div>
                    <div className="mt-1 font-semibold">¥{item.totalAmount.toFixed(2)}</div>
                  </div>
                </div>
                {(item.address || item.trackingNo || item.note) && (
                  <div className="mt-3 rounded bg-gray-50 p-3 text-xs text-gray-600">
                    {item.address && <div>地址：{item.address}</div>}
                    {item.trackingNo && <div className="mt-1">物流：{item.trackingNo}</div>}
                    {item.note && <div className="mt-1">备注：{item.note}</div>}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <AttachmentPanel ownerType="SHIPMENT" ownerId={item.id} compact onMessage={onMessage} />
                  <div className="flex flex-wrap gap-2">
                    {item.status === 'PENDING' && (
                      <button
                        onClick={() => handleAction(item.id, 'ship')}
                        disabled={loading}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        发货
                      </button>
                    )}
                    {item.status === 'SHIPPED' && (
                      <button
                        onClick={() => handleAction(item.id, 'deliver')}
                        disabled={loading}
                        className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition disabled:opacity-50"
                      >
                        签收
                      </button>
                    )}
                    {(item.status === 'SHIPPED' || item.status === 'DELIVERED') && (
                      <a
                        href={`/api/shipments/${item.id}/delivery-note`}
                        className="px-3 py-1 border border-blue-300 text-blue-700 rounded text-xs hover:bg-blue-50"
                      >
                        下载送货单
                      </a>
                    )}
                    {item.status === 'CANCELLED' && (
                      <span className="text-xs text-gray-400">无操作</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">发货单号</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">凭据号</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">产品</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">数量</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">单价</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">总金额</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">客户</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">状态</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">发货日期</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">原始单据</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shipments.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-blue-600">{item.shipmentNo}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{item.voucherNo || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.product?.name}</div>
                      <div className="text-xs text-gray-500">{item.product?.sku}</div>
                    </td>
                    <td className="px-4 py-3">{item.qty}</td>
                    <td className="px-4 py-3">¥{item.unitPrice.toFixed(2)}</td>
                    <td className="px-4 py-3 font-medium">¥{item.totalAmount.toFixed(2)}</td>
	                    <td className="px-4 py-3">
	                      <div className="font-medium">{item.customer}</div>
	                      <div className="text-xs text-gray-500">{item.customerRef ? `客户档案：${item.customerRef.name}` : '未绑定客户档案'}</div>
	                      {item.customerPhone && (
	                        <div className="text-xs text-gray-500">{item.customerPhone}</div>
	                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[item.status]}`}>
                        {statusLabels[item.status] || item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {item.shippedAt ? new Date(item.shippedAt).toLocaleString('zh-CN') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <AttachmentPanel ownerType="SHIPMENT" ownerId={item.id} compact onMessage={onMessage} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {item.status === 'PENDING' && (
                          <button
                            onClick={() => handleAction(item.id, 'ship')}
                            disabled={loading}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition disabled:opacity-50"
                          >
                            发货
                          </button>
                        )}
                        {item.status === 'SHIPPED' && (
                          <button
                            onClick={() => handleAction(item.id, 'deliver')}
                            disabled={loading}
                            className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition disabled:opacity-50"
                          >
                            签收
                          </button>
                        )}
                        {(item.status === 'SHIPPED' || item.status === 'DELIVERED') && (
                          <a
                            href={`/api/shipments/${item.id}/delivery-note`}
                            className="px-3 py-1 border border-blue-300 text-blue-700 rounded text-xs hover:bg-blue-50"
                          >
                            下载送货单
                          </a>
                        )}
                        {item.status === 'CANCELLED' && (
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
              <h3 className="text-lg font-semibold">新增发货单</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">凭据号</label>
                <input
                  type="text"
                  value={form.voucherNo}
                  onChange={(e) => setForm({ ...form, voucherNo: e.target.value })}
                  placeholder="客户订单号、送货凭据号或纸质单号"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">产品</label>
                <select
                  value={form.productId}
                  onChange={(e) => handleProductChange(e.target.value)}
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
              <div className="grid grid-cols-2 gap-4">
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">单价</label>
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">客户</label>
                  <select
                    value={form.customerId}
                    onChange={(e) => handleCustomerChange(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">手工填写/未绑定</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>{customer.name} ({customer.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">电话</label>
                  <input
                    type="text"
                    value={form.customerPhone}
                    onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">送货单客户名称</label>
                <input
                  type="text"
                  value={form.customer}
                  onChange={(e) => setForm({ ...form, customer: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">地址</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">发货人</label>
                <input
                  type="text"
                  value={form.shippedBy}
                  onChange={(e) => setForm({ ...form, shippedBy: e.target.value })}
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
    </>
  )
}
