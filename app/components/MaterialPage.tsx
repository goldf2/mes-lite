'use client'

import { useState, useEffect } from 'react'

interface Material {
  id: string
  code: string
  name: string
  spec: string
  unit: string
  stock?: { qty: number; reservedQty: number; availableQty: number }
  createdAt: string
}

export default function MaterialPage({ onMessage }: { onMessage: (msg: string) => void }) {
  const [materials, setMaterials] = useState<Material[]>([])
  const [keyword, setKeyword] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null)
  const [form, setForm] = useState({ code: '', name: '', spec: '', unit: '' })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchMaterials()
  }, [keyword])

  const fetchMaterials = async () => {
    const url = keyword ? `/api/materials?keyword=${encodeURIComponent(keyword)}` : '/api/materials'
    const res = await fetch(url)
    const data = await res.json()
    setMaterials(data.data || [])
  }

  const handleSubmit = async () => {
    if (!form.code || !form.name || !form.unit) {
      onMessage('请填写完整信息')
      return
    }
    setLoading(true)
    try {
      if (editingMaterial) {
        const res = await fetch('/api/materials', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, id: editingMaterial.id }),
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
          body: JSON.stringify(form),
        })
        const data = await res.json()
        if (res.ok) {
          onMessage('物料创建成功')
        } else {
          onMessage(data.error || '创建失败')
        }
      }
      setShowModal(false)
      setForm({ code: '', name: '', spec: '', unit: '' })
      setEditingMaterial(null)
      fetchMaterials()
    } catch (err) {
      onMessage('操作失败')
    }
    setLoading(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除该物料吗？')) return
    try {
      const res = await fetch(`/api/materials?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        onMessage('删除成功')
        fetchMaterials()
      } else {
        onMessage(data.error || '删除失败')
      }
    } catch (err) {
      onMessage('删除失败')
    }
  }

  const handleEdit = (material: Material) => {
    setEditingMaterial(material)
    setForm({ code: material.code, name: material.name, spec: material.spec, unit: material.unit })
    setShowModal(true)
  }

  const handleAdd = () => {
    setEditingMaterial(null)
    setForm({ code: '', name: '', spec: '', unit: '' })
    setShowModal(true)
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">物料管理</h2>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索物料名称或编码"
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition"
          >
            + 新增物料
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">物料编码</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">物料名称</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">规格</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">单位</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">库存</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">可用</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">创建时间</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {materials.map((material) => (
              <tr key={material.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-sm text-blue-600">{material.code}</td>
                <td className="px-4 py-3 font-medium text-sm">{material.name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{material.spec || '-'}</td>
                <td className="px-4 py-3 text-sm">{material.unit}</td>
                <td className="px-4 py-3 text-sm">{material.stock?.qty || 0}</td>
                <td className="px-4 py-3 text-sm text-green-600">{material.stock?.availableQty || 0}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(material.createdAt).toLocaleString('zh-CN')}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleEdit(material)}
                    className="px-3 py-1 text-blue-600 border border-blue-300 rounded text-xs hover:bg-blue-50 transition"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(material.id)}
                    className="ml-2 px-3 py-1 text-red-600 border border-red-300 rounded text-xs hover:bg-red-50 transition"
                  >
                    删除
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
                <label className="block text-sm font-medium text-gray-700 mb-2">单位 *</label>
                <select
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                >
                  <option value="">请选择单位</option>
                  <option value="kg">kg</option>
                  <option value="件">件</option>
                  <option value="个">个</option>
                  <option value="米">米</option>
                  <option value="卷">卷</option>
                  <option value="盒">盒</option>
                  <option value="套">套</option>
                </select>
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
    </div>
  )
}
