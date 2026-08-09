'use client'

import { useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import SearchableSelect from '@/app/components/SearchableSelect'
import { removeDocumentCategory, saveDocumentCategory } from '../client/documents-api'
import type { DocumentCategoryRecord } from '../contracts/work-instruction'

export default function DocumentCategoryManagerPanel({
  categories,
  onChanged,
  onMessage,
  canUpdate = true,
  canDelete = true,
}: {
  categories: DocumentCategoryRecord[]
  onChanged: () => Promise<void>
  onMessage: (message: string) => void
  canUpdate?: boolean
  canDelete?: boolean
}) {
  const [editing, setEditing] = useState<DocumentCategoryRecord | null>(null)
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [saving, setSaving] = useState(false)

  const roots = useMemo(() => categories.filter((category) => !category.parentId), [categories])
  const childrenByParent = useMemo(() => {
    const result = new Map<string, DocumentCategoryRecord[]>()
    for (const category of categories) {
      if (!category.parentId) continue
      const children = result.get(category.parentId) || []
      children.push(category)
      result.set(category.parentId, children)
    }
    return result
  }, [categories])

  const resetForm = () => {
    setEditing(null)
    setName('')
    setParentId('')
  }

  const startEdit = (category: DocumentCategoryRecord) => {
    setEditing(category)
    setName(category.name)
    setParentId(category.parentId || '')
  }

  const save = async () => {
    if (!name.trim()) return onMessage('请输入类别名称')
    setSaving(true)
    try {
      await saveDocumentCategory({ name, parentId: parentId || null }, editing?.id)
      onMessage(editing ? '文档类别已更新' : '文档类别已新增')
      resetForm()
      await onChanged()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存文档类别失败')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (category: DocumentCategoryRecord) => {
    if (!confirm(`确定删除文档类别“${category.name}”吗？`)) return
    try {
      onMessage(await removeDocumentCategory(category.id))
      if (editing?.id === category.id) resetForm()
      await onChanged()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '删除文档类别失败')
    }
  }

  return (
    <>
      {canUpdate && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-4">
          <div className="mb-3 text-sm font-semibold text-gray-900">{editing ? '编辑类别' : '新增类别'}</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.7fr)_auto]">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="类别名称，如机床作业" maxLength={40} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" />
            <SearchableSelect
              value={parentId}
              onChange={setParentId}
              options={[
                { value: '', label: '作为一级类别' },
                ...roots.filter((root) => root.id !== editing?.id).map((root) => ({ value: root.id, label: `归入：${root.name}` })),
              ]}
              placeholder="输入一级类别名称筛选"
            />
            <div className="flex gap-2">
              {editing && <AppButton type="button" onClick={resetForm} size="sm">取消</AppButton>}
              <AppButton type="button" onClick={save} disabled={saving} variant="primary" size="sm">{saving ? '保存中...' : '保存'}</AppButton>
            </div>
          </div>
        </div>
      )}

      <div className={`${canUpdate ? 'mt-4' : ''} space-y-3`}>
        {roots.map((root) => (
          <div key={root.id} className="rounded-lg border border-gray-200">
            <CategoryRow category={root} onEdit={startEdit} onRemove={remove} canUpdate={canUpdate} canDelete={canDelete} />
            {(childrenByParent.get(root.id) || []).map((child) => (
              <div key={child.id} className="border-t border-gray-100 bg-gray-50/60 pl-6">
                <CategoryRow category={child} onEdit={startEdit} onRemove={remove} canUpdate={canUpdate} canDelete={canDelete} child />
              </div>
            ))}
          </div>
        ))}
        {roots.length === 0 && <div className="rounded-lg border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500">暂无文档类别</div>}
      </div>
    </>
  )
}

function CategoryRow({
  category,
  child = false,
  onEdit,
  onRemove,
  canUpdate,
  canDelete,
}: {
  category: DocumentCategoryRecord
  child?: boolean
  onEdit: (category: DocumentCategoryRecord) => void
  onRemove: (category: DocumentCategoryRecord) => void
  canUpdate: boolean
  canDelete: boolean
}) {
  const cannotDelete = category._count.children > 0 || category._count.workInstructions > 0
  const deleteReason = category._count.children > 0
    ? '请先删除下级类别'
    : category._count.workInstructions > 0 ? '仍有产品文档引用' : '删除类别'
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="font-medium text-gray-900">{child ? '└ ' : ''}{category.name}</div>
        <div className="mt-1 text-xs text-gray-500">{category._count.workInstructions} 条文档{!child ? ` · ${category._count.children} 个二级类别` : ''}</div>
      </div>
      {(canUpdate || canDelete) && <div className="flex shrink-0 gap-2">
        {canUpdate && <AppButton type="button" onClick={() => onEdit(category)} size="sm">编辑</AppButton>}
        {canDelete && <AppButton type="button" onClick={() => onRemove(category)} disabled={cannotDelete} title={deleteReason} variant="danger" size="sm">删除</AppButton>}
      </div>}
    </div>
  )
}
