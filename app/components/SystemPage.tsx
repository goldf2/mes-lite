'use client'

import { useEffect, useState } from 'react'
import ViewModeToggle, { usePersistedViewMode } from './ViewModeToggle'

interface Supplier {
  id: string
  code: string
  name: string
  contact?: string | null
  phone?: string | null
  address?: string | null
  createdAt: string
}

interface Customer {
  id: string
  code: string
  name: string
  contact?: string | null
  phone?: string | null
  address?: string | null
  createdAt: string
}

interface AuditLog {
  id: string
  operatorName?: string | null
  action: string
  entityType: string
  entityId?: string | null
  entityLabel?: string | null
  note?: string | null
  createdAt: string
}

interface DeletedRecord {
  id: string
  label: string
  type: string
  model: 'material' | 'supplier' | 'customer' | 'materialIn' | 'order' | 'dispatch' | 'shipment' | 'return'
  deletedAt?: string | null
}

interface Product {
  id: string
  sku: string
  name: string
  category: string
  customerId?: string | null
  customer?: { id: string; code: string; name: string } | null
  unit: string
  description?: string | null
  createdAt?: string
}

interface ProcessStepForm {
  stepNo: number
  name: string
  defaultTime: number
  workstation: string
  description: string
}

interface ProcessRoute {
  id: string
  productId: string
  name: string
  isDefault: boolean
  product: { id: string; sku: string; name: string }
  steps: Array<{
    id: string
    stepNo: number
    name: string
    defaultTime?: number | null
    workstation?: string | null
    description?: string | null
  }>
}

type SystemTab = 'suppliers' | 'customers' | 'products' | 'process' | 'recycle' | 'audit'

export default function SystemPage({ onMessage }: { onMessage: (msg: string) => void }) {
  const [tab, setTab] = useState<SystemTab>('suppliers')

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">系统管理</h2>
            <p className="text-sm text-gray-500 mt-1">维护客户、供应商、产品、工艺等基础数据。</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {([
              ['suppliers', '供应商'],
              ['customers', '客户'],
              ['products', '产品资料'],
              ['process', 'BOM/工艺'],
              ['recycle', '归档记录'],
              ['audit', '操作记录'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  tab === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'suppliers' && <SupplierManager onMessage={onMessage} />}
      {tab === 'customers' && <CustomerManager onMessage={onMessage} />}
      {tab === 'products' && <ProductManager onMessage={onMessage} />}
      {tab === 'process' && <ProcessManager onMessage={onMessage} />}
      {tab === 'recycle' && <RecycleBin onMessage={onMessage} />}
      {tab === 'audit' && <AuditLogViewer onMessage={onMessage} />}
    </div>
  )
}

function SupplierManager({ onMessage }: { onMessage: (msg: string) => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [keyword, setKeyword] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.system.suppliers.viewMode', 'list')
  const [form, setForm] = useState({
    code: '',
    name: '',
    contact: '',
    phone: '',
    address: '',
  })

  useEffect(() => {
    fetchSuppliers()
  }, [keyword])

  const fetchSuppliers = async () => {
    const url = keyword ? `/api/suppliers?keyword=${encodeURIComponent(keyword)}` : '/api/suppliers'
    const res = await fetch(url)
    const data = await res.json()
    if (res.ok) {
      setSuppliers(data.data || [])
    } else {
      onMessage(data.error || '获取供应商失败')
    }
  }

  const resetForm = () => {
    setForm({ code: '', name: '', contact: '', phone: '', address: '' })
    setEditingSupplier(null)
  }

  const openAdd = () => {
    resetForm()
    setShowModal(true)
  }

  const openEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    setForm({
      code: supplier.code,
      name: supplier.name,
      contact: supplier.contact || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
    })
    setShowModal(true)
  }

  const submit = async () => {
    if (!form.code || !form.name) {
      onMessage('供应商编码和名称必填')
      return
    }

    setLoading(true)
    const res = await fetch('/api/suppliers', {
      method: editingSupplier ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        id: editingSupplier?.id,
        contact: form.contact || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      onMessage(editingSupplier ? '供应商已更新' : '供应商已创建')
      setShowModal(false)
      resetForm()
      await fetchSuppliers()
    } else {
      onMessage(data.error || '操作失败')
    }
    setLoading(false)
  }

  const remove = async (supplier: Supplier) => {
    if (!confirm(`确定归档供应商「${supplier.name}」吗？归档后可在归档记录中恢复。`)) return
    const res = await fetch(`/api/suppliers?id=${supplier.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (res.ok) {
      onMessage('供应商已归档')
      await fetchSuppliers()
    } else {
      onMessage(data.error || '归档失败')
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">供应商管理</h3>
          <p className="text-sm text-gray-500 mt-1">用于来料单选择供应商，不再使用的供应商只能归档。</p>
        </div>
        <div className="flex items-center gap-3">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索编码、名称、联系人、电话"
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm w-64"
          />
          <button onClick={openAdd} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
            新增供应商
          </button>
        </div>
      </div>

      {viewMode === 'card' && suppliers.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {suppliers.map((supplier) => (
            <div key={supplier.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-gray-900">{supplier.name}</div>
                  <div className="mt-1 font-mono text-sm text-blue-700">{supplier.code}</div>
                </div>
                <button onClick={() => openEdit(supplier)} className="shrink-0 px-3 py-1 text-blue-600 border border-blue-300 rounded text-xs hover:bg-blue-50">
                  编辑
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500">联系人</div>
                  <div className="mt-1">{supplier.contact || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">电话</div>
                  <div className="mt-1">{supplier.phone || '-'}</div>
                </div>
              </div>
              <div className="mt-3 text-sm text-gray-600">地址：{supplier.address || '-'}</div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-xs text-gray-500">{new Date(supplier.createdAt).toLocaleString('zh-CN')}</div>
                <button onClick={() => remove(supplier)} className="px-3 py-1 text-red-600 border border-red-300 rounded text-xs hover:bg-red-50">
                  归档
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">编码</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">名称</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">联系人</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">电话</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">地址</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">创建时间</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {suppliers.map((supplier) => (
              <tr key={supplier.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-blue-700 text-sm">{supplier.code}</td>
                <td className="px-4 py-3 font-medium text-sm">{supplier.name}</td>
                <td className="px-4 py-3 text-sm">{supplier.contact || '-'}</td>
                <td className="px-4 py-3 text-sm">{supplier.phone || '-'}</td>
                <td className="px-4 py-3 text-sm max-w-xs truncate">{supplier.address || '-'}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(supplier.createdAt).toLocaleString('zh-CN')}</td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(supplier)} className="px-3 py-1 text-blue-600 border border-blue-300 rounded text-xs hover:bg-blue-50">
                    编辑
                  </button>
                  <button onClick={() => remove(supplier)} className="ml-2 px-3 py-1 text-red-600 border border-red-300 rounded text-xs hover:bg-red-50">
                    归档
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {suppliers.length === 0 && <div className="text-center py-12 text-gray-500">暂无供应商</div>}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">{editingSupplier ? '编辑供应商' : '新增供应商'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">&times;</button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="供应商编码 *" value={form.code} onChange={(value) => setForm({ ...form, code: value })} />
                <Field label="供应商名称 *" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="联系人" value={form.contact} onChange={(value) => setForm({ ...form, contact: value })} />
                <Field label="电话" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">地址</label>
                <textarea
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={submit} disabled={loading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {loading ? '保存中...' : '保存'}
                </button>
                <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
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

function CustomerManager({ onMessage }: { onMessage: (msg: string) => void }) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [keyword, setKeyword] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.system.customers.viewMode', 'list')
  const [form, setForm] = useState({
    code: '',
    name: '',
    contact: '',
    phone: '',
    address: '',
  })

  useEffect(() => {
    fetchCustomers()
  }, [keyword])

  const fetchCustomers = async () => {
    const url = keyword ? `/api/customers?keyword=${encodeURIComponent(keyword)}` : '/api/customers'
    const res = await fetch(url)
    const data = await res.json()
    if (res.ok) {
      setCustomers(data.data || [])
    } else {
      onMessage(data.error || '获取客户失败')
    }
  }

  const resetForm = () => {
    setForm({ code: '', name: '', contact: '', phone: '', address: '' })
    setEditingCustomer(null)
  }

  const openAdd = () => {
    resetForm()
    setShowModal(true)
  }

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer)
    setForm({
      code: customer.code,
      name: customer.name,
      contact: customer.contact || '',
      phone: customer.phone || '',
      address: customer.address || '',
    })
    setShowModal(true)
  }

  const submit = async () => {
    if (!form.code || !form.name) {
      onMessage('客户编码和名称必填')
      return
    }

    setLoading(true)
    const res = await fetch('/api/customers', {
      method: editingCustomer ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        id: editingCustomer?.id,
        contact: form.contact || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      onMessage(editingCustomer ? '客户已更新' : '客户已创建')
      setShowModal(false)
      resetForm()
      await fetchCustomers()
    } else {
      onMessage(data.error || '操作失败')
    }
    setLoading(false)
  }

  const remove = async (customer: Customer) => {
    if (!confirm(`确定归档客户「${customer.name}」吗？归档后可在归档记录中恢复。`)) return
    const res = await fetch(`/api/customers?id=${customer.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (res.ok) {
      onMessage('客户已归档')
      await fetchCustomers()
    } else {
      onMessage(data.error || '归档失败')
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">客户管理</h3>
          <p className="text-sm text-gray-500 mt-1">用于按最终客户筛选产品、物料、库存和发货记录。</p>
        </div>
        <div className="flex items-center gap-3">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索编码、名称、联系人、电话"
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm w-64"
          />
          <button onClick={openAdd} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
            新增客户
          </button>
        </div>
      </div>

      {viewMode === 'card' && customers.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {customers.map((customer) => (
            <div key={customer.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-gray-900">{customer.name}</div>
                  <div className="mt-1 font-mono text-sm text-blue-700">{customer.code}</div>
                </div>
                <button onClick={() => openEdit(customer)} className="shrink-0 px-3 py-1 text-blue-600 border border-blue-300 rounded text-xs hover:bg-blue-50">
                  编辑
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500">联系人</div>
                  <div className="mt-1">{customer.contact || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">电话</div>
                  <div className="mt-1">{customer.phone || '-'}</div>
                </div>
              </div>
              <div className="mt-3 text-sm text-gray-600">地址：{customer.address || '-'}</div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-xs text-gray-500">{new Date(customer.createdAt).toLocaleString('zh-CN')}</div>
                <button onClick={() => remove(customer)} className="px-3 py-1 text-red-600 border border-red-300 rounded text-xs hover:bg-red-50">
                  归档
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">编码</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">名称</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">联系人</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">电话</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">地址</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">创建时间</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {customers.map((customer) => (
              <tr key={customer.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-blue-700 text-sm">{customer.code}</td>
                <td className="px-4 py-3 font-medium text-sm">{customer.name}</td>
                <td className="px-4 py-3 text-sm">{customer.contact || '-'}</td>
                <td className="px-4 py-3 text-sm">{customer.phone || '-'}</td>
                <td className="px-4 py-3 text-sm max-w-xs truncate">{customer.address || '-'}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(customer.createdAt).toLocaleString('zh-CN')}</td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(customer)} className="px-3 py-1 text-blue-600 border border-blue-300 rounded text-xs hover:bg-blue-50">
                    编辑
                  </button>
                  <button onClick={() => remove(customer)} className="ml-2 px-3 py-1 text-red-600 border border-red-300 rounded text-xs hover:bg-red-50">
                    归档
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {customers.length === 0 && <div className="text-center py-12 text-gray-500">暂无客户</div>}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">{editingCustomer ? '编辑客户' : '新增客户'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">&times;</button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="客户编码 *" value={form.code} onChange={(value) => setForm({ ...form, code: value })} />
                <Field label="客户名称 *" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="联系人" value={form.contact} onChange={(value) => setForm({ ...form, contact: value })} />
                <Field label="电话" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">地址</label>
                <textarea
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={submit} disabled={loading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {loading ? '保存中...' : '保存'}
                </button>
                <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
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

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-4 py-2 border border-gray-200 rounded-lg" />
    </div>
  )
}

function ProductManager({ onMessage }: { onMessage: (msg: string) => void }) {
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [keyword, setKeyword] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.system.products.viewMode', 'list')
  const [form, setForm] = useState({
    sku: '',
    name: '',
    category: '',
    customerId: '',
    unit: '件',
    description: '',
  })

  useEffect(() => {
    fetchProducts()
    fetchCustomers()
  }, [])

  const fetchProducts = async () => {
    const res = await fetch('/api/products')
    const data = await res.json()
    if (res.ok) {
      setProducts(data.data || [])
    } else {
      onMessage(data.error || '获取产品失败')
    }
  }

  const fetchCustomers = async () => {
    const res = await fetch('/api/customers')
    const data = await res.json()
    if (res.ok) {
      setCustomers(data.data || [])
    } else {
      onMessage(data.error || '获取客户失败')
    }
  }

  const resetForm = () => {
    setEditingProduct(null)
    setForm({ sku: '', name: '', category: '', customerId: '', unit: '件', description: '' })
  }

  const openAdd = () => {
    resetForm()
    setShowModal(true)
  }

  const openEdit = (product: Product) => {
    setEditingProduct(product)
    setForm({
      sku: product.sku,
      name: product.name,
      category: product.category,
      customerId: product.customerId || '',
      unit: product.unit,
      description: product.description || '',
    })
    setShowModal(true)
  }

  const submit = async () => {
    if (!form.sku || !form.name || !form.category || !form.unit) {
      onMessage('产品编码、名称、类别和单位必填')
      return
    }

    setLoading(true)
    const res = await fetch('/api/products', {
      method: editingProduct ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        id: editingProduct?.id,
        description: form.description || undefined,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      onMessage(editingProduct ? '产品已更新' : '产品已创建')
      setShowModal(false)
      resetForm()
      await fetchProducts()
    } else {
      onMessage(data.error || '保存产品失败')
    }
    setLoading(false)
  }

  const filtered = keyword
    ? products.filter((product) =>
        [product.sku, product.name, product.category, product.unit, product.description || ''].some((value) => value.includes(keyword))
        || (product.customer?.name || '').includes(keyword)
        || (product.customer?.code || '').includes(keyword)
      )
    : products

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">产品资料</h3>
          <p className="text-sm text-gray-500 mt-1">维护成品编码、名称、类别和单位，供工单、发货和退货选择。</p>
        </div>
        <div className="flex items-center gap-3">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索编码、名称、类别"
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm w-64"
          />
          <button onClick={openAdd} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
            新增产品
          </button>
        </div>
      </div>

      {viewMode === 'card' && filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => (
            <div key={product.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-gray-900">{product.name}</div>
                  <div className="mt-1 font-mono text-sm text-blue-700">{product.sku}</div>
                </div>
                <button onClick={() => openEdit(product)} className="shrink-0 px-3 py-1 text-blue-600 border border-blue-300 rounded text-xs hover:bg-blue-50">
                  编辑
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500">类别</div>
                  <div className="mt-1">{product.category}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">单位</div>
                  <div className="mt-1">{product.unit}</div>
                </div>
              </div>
              <div className="mt-3 text-sm text-gray-600">客户：{product.customer ? `${product.customer.name} (${product.customer.code})` : '通用/未绑定'}</div>
              <div className="mt-3 rounded bg-gray-50 p-3 text-sm text-gray-600">{product.description || '无说明'}</div>
            </div>
          ))}
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">产品编码</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">产品名称</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">类别</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">归属客户</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">单位</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">说明</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((product) => (
              <tr key={product.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-blue-700 text-sm">{product.sku}</td>
                <td className="px-4 py-3 font-medium text-sm">{product.name}</td>
                <td className="px-4 py-3 text-sm">{product.category}</td>
                <td className="px-4 py-3 text-sm">{product.customer ? `${product.customer.name} (${product.customer.code})` : '通用/未绑定'}</td>
                <td className="px-4 py-3 text-sm">{product.unit}</td>
                <td className="px-4 py-3 text-sm max-w-md truncate">{product.description || '-'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(product)} className="px-3 py-1 text-blue-600 border border-blue-300 rounded text-xs hover:bg-blue-50">
                    编辑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {filtered.length === 0 && <div className="text-center py-12 text-gray-500">暂无产品资料</div>}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">{editingProduct ? '编辑产品' : '新增产品'}</h3>
              <button onClick={() => { setShowModal(false); resetForm() }} className="text-gray-500 hover:text-gray-700">&times;</button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="产品编码 *" value={form.sku} onChange={(value) => setForm({ ...form, sku: value })} />
                <Field label="产品名称 *" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="产品类别 *" value={form.category} onChange={(value) => setForm({ ...form, category: value })} />
                <Field label="单位 *" value={form.unit} onChange={(value) => setForm({ ...form, unit: value })} />
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
                <p className="mt-1 text-xs text-gray-500">客户筛选只匹配直接绑定的产品，不追溯 BOM 或辅料。</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">说明</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={submit} disabled={loading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {loading ? '保存中...' : '保存'}
                </button>
                <button onClick={() => { setShowModal(false); resetForm() }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
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

function ProcessManager({ onMessage }: { onMessage: (msg: string) => void }) {
  const emptyStep = (): ProcessStepForm => ({ stepNo: 1, name: '', defaultTime: 0, workstation: '', description: '' })
  const [routes, setRoutes] = useState<ProcessRoute[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingRoute, setEditingRoute] = useState<ProcessRoute | null>(null)
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.system.process.viewMode', 'list')
  const [form, setForm] = useState({
    productId: '',
    name: '',
    isDefault: true,
    steps: [emptyStep()],
  })

  useEffect(() => {
    fetchProducts()
    fetchRoutes()
  }, [])

  const fetchProducts = async () => {
    const res = await fetch('/api/products')
    const data = await res.json()
    if (res.ok) {
      setProducts(data.data || [])
    } else {
      onMessage(data.error || '获取产品失败')
    }
  }

  const fetchRoutes = async () => {
    const res = await fetch('/api/process-routes')
    const data = await res.json()
    if (res.ok) {
      setRoutes(data.data || [])
    } else {
      onMessage(data.error || '获取工艺路线失败')
    }
  }

  const resetForm = () => {
    setEditingRoute(null)
    setForm({ productId: '', name: '', isDefault: true, steps: [emptyStep()] })
  }

  const openAdd = () => {
    resetForm()
    setShowModal(true)
  }

  const openEdit = (route: ProcessRoute) => {
    setEditingRoute(route)
    setForm({
      productId: route.productId,
      name: route.name,
      isDefault: route.isDefault,
      steps: route.steps.length > 0
        ? route.steps.map((step) => ({
            stepNo: step.stepNo,
            name: step.name,
            defaultTime: step.defaultTime || 0,
            workstation: step.workstation || '',
            description: step.description || '',
          }))
        : [emptyStep()],
    })
    setShowModal(true)
  }

  const updateStep = (index: number, patch: Partial<ProcessStepForm>) => {
    setForm({
      ...form,
      steps: form.steps.map((step, currentIndex) => currentIndex === index ? { ...step, ...patch } : step),
    })
  }

  const addStep = () => {
    const nextNo = form.steps.length > 0 ? Math.max(...form.steps.map((step) => step.stepNo)) + 1 : 1
    setForm({ ...form, steps: [...form.steps, { ...emptyStep(), stepNo: nextNo }] })
  }

  const removeStep = (index: number) => {
    if (form.steps.length <= 1) {
      onMessage('至少需要一个工序')
      return
    }
    setForm({ ...form, steps: form.steps.filter((_, currentIndex) => currentIndex !== index) })
  }

  const submit = async () => {
    if (!form.productId || !form.name || form.steps.some((step) => !step.name || step.stepNo <= 0)) {
      onMessage('产品、路线名称、工序号和工序名称必填')
      return
    }

    setLoading(true)
    const res = await fetch('/api/process-routes', {
      method: editingRoute ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingRoute?.id,
        productId: form.productId,
        name: form.name,
        isDefault: form.isDefault,
        steps: form.steps.map((step) => ({
          stepNo: Number(step.stepNo),
          name: step.name,
          defaultTime: Number(step.defaultTime || 0),
          workstation: step.workstation || undefined,
          description: step.description || undefined,
        })),
      }),
    })
    const data = await res.json()
    if (res.ok) {
      onMessage(editingRoute ? '工艺路线已更新' : '工艺路线已创建')
      setShowModal(false)
      resetForm()
      await fetchRoutes()
    } else {
      onMessage(data.error || '保存工艺路线失败')
    }
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">BOM/工艺</h3>
          <p className="text-sm text-gray-500 mt-1">维护产品工艺路线和工序。已产生派工或报工的工序不建议直接修改。</p>
        </div>
        <div className="flex items-center gap-3">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <button onClick={openAdd} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
            新增工艺路线
          </button>
        </div>
      </div>

      {viewMode === 'card' && routes.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {routes.map((route) => (
            <div key={route.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-900">{route.name}</div>
                  <div className="mt-1 text-sm text-gray-500">{route.product?.name} ({route.product?.sku})</div>
                </div>
                <div className="flex items-center gap-2">
                  {route.isDefault && <span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">默认</span>}
                  <button onClick={() => openEdit(route)} className="px-3 py-1 text-blue-600 border border-blue-300 rounded text-xs hover:bg-blue-50">
                    编辑
                  </button>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {route.steps.map((step) => (
                  <div key={step.id} className="rounded bg-gray-50 p-3 text-sm">
                    <div className="font-medium text-gray-900">{step.stepNo}. {step.name}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {step.workstation ? `工位：${step.workstation}` : '未设工位'}
                      {step.defaultTime ? ` · ${step.defaultTime} 分钟` : ''}
                    </div>
                    {step.description && <div className="mt-1 text-xs text-gray-500">{step.description}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">产品</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">路线名称</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">默认</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">工序</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {routes.map((route) => (
              <tr key={route.id} className="hover:bg-gray-50 align-top">
                <td className="px-4 py-3">
                  <div className="font-medium text-sm">{route.product?.name}</div>
                  <div className="text-xs text-gray-500">{route.product?.sku}</div>
                </td>
                <td className="px-4 py-3 text-sm">{route.name}</td>
                <td className="px-4 py-3 text-sm">{route.isDefault ? '是' : '-'}</td>
                <td className="px-4 py-3 text-sm">
                  <div className="space-y-1">
                    {route.steps.map((step) => (
                      <div key={step.id}>
                        {step.stepNo}. {step.name}
                        {step.workstation ? <span className="text-gray-500"> / {step.workstation}</span> : null}
                        {step.defaultTime ? <span className="text-gray-500"> / {step.defaultTime} 分钟</span> : null}
                      </div>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(route)} className="px-3 py-1 text-blue-600 border border-blue-300 rounded text-xs hover:bg-blue-50">
                    编辑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {routes.length === 0 && <div className="text-center py-12 text-gray-500">暂无工艺路线</div>}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">{editingRoute ? '编辑工艺路线' : '新增工艺路线'}</h3>
              <button onClick={() => { setShowModal(false); resetForm() }} className="text-gray-500 hover:text-gray-700">&times;</button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">产品 *</label>
                  <select
                    value={form.productId}
                    onChange={(e) => setForm({ ...form, productId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                  >
                    <option value="">请选择产品</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>
                    ))}
                  </select>
                </div>
                <Field label="路线名称 *" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                  className="h-4 w-4"
                />
                设为该产品默认工艺路线
              </label>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">工序列表</h4>
                  <button onClick={addStep} className="px-3 py-1 text-sm text-green-700 border border-green-300 rounded hover:bg-green-50">
                    新增工序
                  </button>
                </div>
                <div className="space-y-3">
                  {form.steps.map((step, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-3">
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">工序号 *</label>
                          <input
                            type="number"
                            value={step.stepNo || ''}
                            onChange={(e) => updateStep(index, { stepNo: Number(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-200 rounded"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">工序名称 *</label>
                          <input
                            value={step.name}
                            onChange={(e) => updateStep(index, { name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">工位</label>
                          <input
                            value={step.workstation}
                            onChange={(e) => updateStep(index, { workstation: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">默认工时(分钟)</label>
                          <input
                            type="number"
                            value={step.defaultTime || ''}
                            onChange={(e) => updateStep(index, { defaultTime: Number(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-200 rounded"
                          />
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="block text-xs text-gray-500 mb-1">说明</label>
                        <input
                          value={step.description}
                          onChange={(e) => updateStep(index, { description: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded"
                        />
                      </div>
                      <div className="mt-3 flex justify-end">
                        <button onClick={() => removeStep(index)} className="px-3 py-1 text-xs text-red-600 border border-red-300 rounded hover:bg-red-50">
                          移除本工序
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={submit} disabled={loading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {loading ? '保存中...' : '保存'}
                </button>
                <button onClick={() => { setShowModal(false); resetForm() }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
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

function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-8">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  )
}

function RecycleBin({ onMessage }: { onMessage: (msg: string) => void }) {
  const [records, setRecords] = useState<DeletedRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.system.recycle.viewMode', 'list')

  useEffect(() => {
    fetchDeletedRecords()
  }, [])

  const flattenRecords = (data: any): DeletedRecord[] => {
    const rows: DeletedRecord[] = []
    ;(data.materials || []).forEach((item: any) => rows.push({ id: item.id, label: item.code, type: '物料', model: 'material', deletedAt: item.deletedAt }))
    ;(data.suppliers || []).forEach((item: any) => rows.push({ id: item.id, label: item.code, type: '供应商', model: 'supplier', deletedAt: item.deletedAt }))
    ;(data.customers || []).forEach((item: any) => rows.push({ id: item.id, label: item.code, type: '客户', model: 'customer', deletedAt: item.deletedAt }))
    ;(data.materialIn || []).forEach((item: any) => rows.push({ id: item.id, label: item.inboundNo, type: '来料单', model: 'materialIn', deletedAt: item.deletedAt }))
    ;(data.orders || []).forEach((item: any) => rows.push({ id: item.id, label: item.orderNo, type: '工单', model: 'order', deletedAt: item.deletedAt }))
    ;(data.dispatches || []).forEach((item: any) => rows.push({ id: item.id, label: item.dispatchNo, type: '派工单', model: 'dispatch', deletedAt: item.deletedAt }))
    ;(data.shipments || []).forEach((item: any) => rows.push({ id: item.id, label: item.shipmentNo, type: '发货单', model: 'shipment', deletedAt: item.deletedAt }))
    ;(data.returns || []).forEach((item: any) => rows.push({ id: item.id, label: item.returnNo, type: '退货单', model: 'return', deletedAt: item.deletedAt }))
    return rows.sort((a, b) => String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')))
  }

  const fetchDeletedRecords = async () => {
    setLoading(true)
    const res = await fetch('/api/deleted-records')
    const data = await res.json()
    if (res.ok) {
      setRecords(flattenRecords(data.data || {}))
    } else {
      onMessage(data.error || '获取归档记录失败')
    }
    setLoading(false)
  }

  const restore = async (record: DeletedRecord) => {
    const res = await fetch('/api/restore', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: record.model, id: record.id }),
    })
    const data = await res.json()
    if (res.ok) {
      onMessage('记录已恢复归档')
      await fetchDeletedRecords()
    } else {
      onMessage(data.error || '恢复归档失败')
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">归档记录</h3>
          <p className="text-sm text-gray-500 mt-1">业务数据归档后不会物理删除，可在这里恢复。</p>
        </div>
        <div className="flex items-center gap-3">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <button onClick={fetchDeletedRecords} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
            刷新
          </button>
        </div>
      </div>
      {viewMode === 'card' && records.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {records.map((record) => (
            <div key={`${record.model}-${record.id}`} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-sm font-semibold text-blue-700">{record.label}</div>
                  <div className="mt-1 text-sm text-gray-500">{record.type}</div>
                </div>
                <button onClick={() => restore(record)} className="px-3 py-1 text-blue-600 border border-blue-300 rounded text-xs hover:bg-blue-50">
                  恢复归档
                </button>
              </div>
              <div className="mt-4 text-xs text-gray-500">归档时间：{record.deletedAt ? new Date(record.deletedAt).toLocaleString('zh-CN') : '-'}</div>
            </div>
          ))}
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">类型</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">编号</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">归档时间</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {records.map((record) => (
              <tr key={`${record.model}-${record.id}`} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">{record.type}</td>
                <td className="px-4 py-3 font-mono text-sm text-blue-700">{record.label}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{record.deletedAt ? new Date(record.deletedAt).toLocaleString('zh-CN') : '-'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => restore(record)} className="px-3 py-1 text-blue-600 border border-blue-300 rounded text-xs hover:bg-blue-50">
                    恢复归档
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {!loading && records.length === 0 && <div className="text-center py-12 text-gray-500">暂无归档记录</div>}
    </div>
  )
}

function AuditLogViewer({ onMessage }: { onMessage: (msg: string) => void }) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.system.audit.viewMode', 'list')

  useEffect(() => {
    fetchLogs()
  }, [])

  const fetchLogs = async () => {
    setLoading(true)
    const res = await fetch('/api/audit-logs?pageSize=100')
    const data = await res.json()
    if (res.ok) {
      setLogs(data.data || [])
    } else {
      onMessage(data.error || '获取操作记录失败')
    }
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">操作记录</h3>
          <p className="text-sm text-gray-500 mt-1">记录新增、修改、归档、恢复、收货、盘点等关键操作。</p>
        </div>
        <div className="flex items-center gap-3">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <button onClick={fetchLogs} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
            刷新
          </button>
        </div>
      </div>
      {viewMode === 'card' && logs.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {logs.map((log) => (
            <div key={log.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="font-semibold text-gray-900">{log.action}</div>
                <div className="text-xs text-gray-500">{new Date(log.createdAt).toLocaleString('zh-CN')}</div>
              </div>
              <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <div className="text-xs text-gray-500">人员</div>
                  <div className="mt-1">{log.operatorName || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">对象</div>
                  <div className="mt-1">{log.entityType} {log.entityLabel || log.entityId || ''}</div>
                </div>
              </div>
              <div className="mt-3 rounded bg-gray-50 p-3 text-sm text-gray-600">{log.note || '-'}</div>
            </div>
          ))}
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">时间</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">人员</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">动作</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">对象</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">备注</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(log.createdAt).toLocaleString('zh-CN')}</td>
                <td className="px-4 py-3 text-sm">{log.operatorName || '-'}</td>
                <td className="px-4 py-3 text-sm font-medium">{log.action}</td>
                <td className="px-4 py-3 text-sm">{log.entityType} {log.entityLabel || log.entityId || ''}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{log.note || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {!loading && logs.length === 0 && <div className="text-center py-12 text-gray-500">暂无操作记录</div>}
    </div>
  )
}
