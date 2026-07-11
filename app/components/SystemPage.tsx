'use client'

import { useEffect, useState } from 'react'

interface Supplier {
  id: string
  code: string
  name: string
  contact?: string | null
  phone?: string | null
  address?: string | null
  createdAt: string
}

type SystemTab = 'suppliers' | 'products' | 'process'

export default function SystemPage({ onMessage }: { onMessage: (msg: string) => void }) {
  const [tab, setTab] = useState<SystemTab>('suppliers')

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">系统管理</h2>
            <p className="text-sm text-gray-500 mt-1">维护供应商、产品、工艺等基础数据。</p>
          </div>
          <div className="flex gap-2">
            {([
              ['suppliers', '供应商'],
              ['products', '产品资料'],
              ['process', 'BOM/工艺'],
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
      {tab === 'products' && (
        <Placeholder title="产品资料" text="当前产品资料已有只读接口，后续可在这里加入产品新增、编辑、停用和成品基础库存维护。" />
      )}
      {tab === 'process' && (
        <Placeholder title="BOM/工艺" text="后续可在这里维护 BOM 版本、工艺路线、工序和默认路线。" />
      )}
    </div>
  )
}

function SupplierManager({ onMessage }: { onMessage: (msg: string) => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [keyword, setKeyword] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [loading, setLoading] = useState(false)
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
    if (!confirm(`确定删除供应商「${supplier.name}」吗？`)) return
    const res = await fetch(`/api/suppliers?id=${supplier.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (res.ok) {
      onMessage('供应商已删除')
      await fetchSuppliers()
    } else {
      onMessage(data.error || '删除失败')
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">供应商管理</h3>
          <p className="text-sm text-gray-500 mt-1">用于来料单选择供应商，已有来料记录的供应商不能删除。</p>
        </div>
        <div className="flex items-center gap-3">
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
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-4 py-2 border border-gray-200 rounded-lg" />
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
