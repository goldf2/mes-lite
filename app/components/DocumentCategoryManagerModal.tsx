'use client'

import { useEffect, useMemo, useState } from 'react'

export interface DocumentCategoryItem {
  id: string
  name: string
  parentId?: string | null
  parent?: { id: string; name: string } | null
  sortOrder: number
  _count: {
    children: number
    workInstructions: number
  }
}

export function documentCategoryLabel(category: Pick<DocumentCategoryItem, 'name' | 'parent'>) {
  return category.parent ? `${category.parent.name} / ${category.name}` : category.name
}

export function documentCategoryOptions(categories: DocumentCategoryItem[]) {
  const roots = categories.filter((category) => !category.parentId)
  const childrenByParent = new Map<string, DocumentCategoryItem[]>()
  for (const category of categories) {
    if (!category.parentId) continue
    const children = childrenByParent.get(category.parentId) || []
    children.push(category)
    childrenByParent.set(category.parentId, children)
  }

  return roots.flatMap((root) => [
    { value: root.id, label: root.name },
    ...(childrenByParent.get(root.id) || []).map((child) => ({
      value: child.id,
      label: `${root.name} / ${child.name}`,
    })),
  ])
}

export default function DocumentCategoryManagerModal({
  open,
  categories,
  onClose,
  onChanged,
  onMessage,
}: {
  open: boolean
  categories: DocumentCategoryItem[]
  onClose: () => void
  onChanged: () => Promise<void>
  onMessage: (message: string) => void
}) {
  const [editing, setEditing] = useState<DocumentCategoryItem | null>(null)
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [saving, setSaving] = useState(false)

  const roots = useMemo(
    () => categories.filter((category) => !category.parentId),
    [categories],
  )
  const childrenByParent = useMemo(() => {
    const result = new Map<string, DocumentCategoryItem[]>()
    for (const category of categories) {
      if (!category.parentId) continue
      const children = result.get(category.parentId) || []
      children.push(category)
      result.set(category.parentId, children)
    }
    return result
  }, [categories])

  useEffect(() => {
    if (!open) {
      setEditing(null)
      setName('')
      setParentId('')
    }
  }, [open])

  if (!open) return null

  const resetForm = () => {
    setEditing(null)
    setName('')
    setParentId('')
  }

  const startEdit = (category: DocumentCategoryItem) => {
    setEditing(category)
    setName(category.name)
    setParentId(category.parentId || '')
  }

  const save = async () => {
    if (!name.trim()) {
      onMessage('请输入类别名称')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/document-categories', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : {}),
          name: name.trim(),
          parentId: parentId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '保存文档类别失败')
        return
      }
      onMessage(editing ? '文档类别已更新' : '文档类别已新增')
      resetForm()
      await onChanged()
    } catch (error) {
      onMessage('保存文档类别失败')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (category: DocumentCategoryItem) => {
    if (!confirm(`确定删除文档类别“${category.name}”吗？`)) return
    try {
      const res = await fetch(`/api/document-categories?id=${encodeURIComponent(category.id)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        onMessage(data.error || '删除文档类别失败')
        return
      }
      onMessage(data.message || '文档类别已删除')
      if (editing?.id === category.id) resetForm()
      await onChanged()
    } catch (error) {
      onMessage('删除文档类别失败')
    }
  }

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center mes-modal-overlay p-3 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3 sm:px-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">文档类别管理</h3>
            <p className="mt-1 text-xs text-gray-500">一级类别可直接使用，也可添加二级类别；最多支持两级。</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 text-2xl text-gray-400 hover:text-gray-700" aria-label="关闭类别管理">&times;</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-4">
            <div className="mb-3 text-sm font-semibold text-gray-900">{editing ? '编辑类别' : '新增类别'}</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.7fr)_auto]">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="类别名称，如机床作业"
                maxLength={40}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              />
              <select
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">作为一级类别</option>
                {roots.filter((root) => root.id !== editing?.id).map((root) => (
                  <option key={root.id} value={root.id}>归入：{root.name}</option>
                ))}
              </select>
              <div className="flex gap-2">
                {editing && (
                  <button type="button" onClick={resetForm} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    取消
                  </button>
                )}
                <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {roots.map((root) => (
              <div key={root.id} className="rounded-lg border border-gray-200">
                <CategoryRow category={root} onEdit={startEdit} onRemove={remove} />
                {(childrenByParent.get(root.id) || []).map((child) => (
                  <div key={child.id} className="border-t border-gray-100 bg-gray-50/60 pl-6">
                    <CategoryRow category={child} onEdit={startEdit} onRemove={remove} child />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function CategoryRow({
  category,
  child = false,
  onEdit,
  onRemove,
}: {
  category: DocumentCategoryItem
  child?: boolean
  onEdit: (category: DocumentCategoryItem) => void
  onRemove: (category: DocumentCategoryItem) => void
}) {
  const cannotDelete = category._count.children > 0 || category._count.workInstructions > 0
  const deleteReason = category._count.children > 0
    ? '请先删除下级类别'
    : category._count.workInstructions > 0
      ? '仍有产品文档引用'
      : '删除类别'

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="font-medium text-gray-900">{child ? '└ ' : ''}{category.name}</div>
        <div className="mt-1 text-xs text-gray-500">
          {category._count.workInstructions} 条文档{!child ? ` · ${category._count.children} 个二级类别` : ''}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={() => onEdit(category)} className="rounded border border-blue-300 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50">
          编辑
        </button>
        <button
          type="button"
          onClick={() => onRemove(category)}
          disabled={cannotDelete}
          title={deleteReason}
          className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
        >
          删除
        </button>
      </div>
    </div>
  )
}
