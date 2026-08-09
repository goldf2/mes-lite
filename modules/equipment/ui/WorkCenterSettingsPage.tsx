'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import { ConfigurationManualOrder } from '@/modules/configuration'
import FormField, { appInputClassName, appTextareaClassName } from '@/app/components/FormField'
import { ResourceFormDialog, ResourcePage, ResourceSortLabel, type ResourceTableColumn } from '@/app/components/resource'
import useClientTableSort from '@/app/components/useClientTableSort'
import { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import { filterByKeywordQuery } from '@/lib/resource-search'
import { archiveWorkCenter, loadManagedWorkCenters, saveWorkCenter } from '../client/equipment-api'
import type { WorkCenterConfig } from '../contracts/equipment'
import { workCenterAdvancedFields, workCenterSearchProfile } from '../model/work-center-view'

const emptyForm = { code: '', name: '', category: '', note: '', isActive: true }

export default function WorkCenterSettingsPage({ onMessage }: { onMessage: (message: string) => void }) {
  const [items, setItems] = useState<WorkCenterConfig[]>([])
  const [keyword, setKeyword] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<WorkCenterConfig | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.system.work-centers.viewMode', 'list')
  const filteredItems = useMemo(() => filterByKeywordQuery(items, keyword, workCenterSearchProfile), [items, keyword])
  const tableSort = useClientTableSort(filteredItems, {
    manual: (item) => item.sortOrder,
    center: (item) => `${item.code} ${item.name}`,
    category: (item) => item.category || '',
    equipment: (item) => item._count.equipment,
    documents: (item) => item._count.workInstructions,
    status: (item) => item.isActive ? '启用' : '已归档',
  }, 'manual', 'asc')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await loadManagedWorkCenters())
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取工作中心失败')
    } finally {
      setLoading(false)
    }
  }, [onMessage])

  useEffect(() => { void load() }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (item: WorkCenterConfig) => {
    setEditing(item)
    setForm({ code: item.code, name: item.name, category: item.category || '', note: item.note || '', isActive: true })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) return onMessage('请填写工作中心编码和名称')
    setSaving(true)
    try {
      setItems(await saveWorkCenter(form, editing?.id))
      setDialogOpen(false)
      onMessage(editing ? '工作中心已更新' : '工作中心已新增')
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存工作中心失败')
    } finally {
      setSaving(false)
    }
  }

  const archive = async (item: WorkCenterConfig) => {
    if (!confirm(`确认归档工作中心“${item.code} · ${item.name}”吗？`)) return
    try {
      setItems(await archiveWorkCenter(item.id))
      onMessage('工作中心已归档')
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '归档工作中心失败')
    }
  }

  const columns: ResourceTableColumn<WorkCenterConfig>[] = [
    { key: 'center', label: <ResourceSortLabel column="center" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>工作中心</ResourceSortLabel>, render: (item) => <div><div className="font-medium text-gray-900">{item.name}</div><div className="font-mono text-xs text-blue-700">{item.code}</div>{item.note && <div className="mt-1 line-clamp-2 text-xs text-gray-500">{item.note}</div>}</div> },
    { key: 'category', label: <ResourceSortLabel column="category" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>类别</ResourceSortLabel>, render: (item) => item.category || '-', hideBelow: 'sm' },
    { key: 'equipment', label: <ResourceSortLabel column="equipment" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>设备</ResourceSortLabel>, render: (item) => item._count.equipment, hideBelow: 'md' },
    { key: 'documents', label: <ResourceSortLabel column="documents" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>工艺文档</ResourceSortLabel>, render: (item) => item._count.workInstructions, hideBelow: 'md' },
    { key: 'status', label: <ResourceSortLabel column="status" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>状态</ResourceSortLabel>, render: (item) => <span className={`rounded px-2 py-1 text-xs ${item.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{item.isActive ? '启用' : '已归档'}</span> },
    { key: 'actions', label: <span className="block text-right">操作</span>, render: (item) => <div className="flex justify-end gap-2"><AppButton size="sm" onClick={() => openEdit(item)}>{item.isActive ? '编辑' : '恢复'}</AppButton>{item.isActive && <AppButton size="sm" variant="warning" onClick={() => void archive(item)}>归档</AppButton>}</div>, className: 'text-right' },
  ]

  return (
    <>
      <ResourcePage
        resourceKey="work-centers"
        title="工作中心"
        description="工作中心表示锯切、钻孔、检验等生产能力区域；设备归属工作中心，工艺文档引用适用工作中心。"
        items={tableSort.sortedRows}
        getKey={(item) => item.id}
        columns={columns}
        renderCard={({ item }) => <article className="h-full rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-gray-900">{item.name}</h2><p className="font-mono text-xs text-blue-700">{item.code}</p></div><span className={`rounded px-2 py-1 text-xs ${item.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{item.isActive ? '启用' : '已归档'}</span></div><p className="mt-3 text-sm text-gray-600">{item.category || '未分类'}</p><p className="mt-2 line-clamp-2 text-xs text-gray-500">{item.note || '暂无备注'}</p><div className="mt-4 flex items-center justify-between text-xs text-gray-500"><span>设备 {item._count.equipment} · 文档 {item._count.workInstructions}</span><AppButton size="sm" onClick={() => openEdit(item)}>{item.isActive ? '编辑' : '恢复'}</AppButton></div></article>}
        loading={loading}
        emptyLabel="暂无工作中心"
        searchValue={keyword}
        onSearchChange={setKeyword}
        searchPlaceholder="输入编码、名称、类别或备注；空格分隔多个关键词"
        advancedSearchFields={workCenterAdvancedFields}
        actions={<ConfigurationManualOrder entity="workCenters" label="工作中心" onMessage={onMessage} onSaved={load} />}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        displayModes={['card', 'list']}
        onCreate={openCreate}
        createLabel="新建工作中心"
        summary={<span className="text-sm text-gray-500">共 {filteredItems.length} 项</span>}
        rowLabel={(item) => `工作中心 ${item.code} ${item.name}`}
      />

      <ResourceFormDialog open={dialogOpen} editing={Boolean(editing)} createTitle="新建工作中心" editTitle="编辑工作中心" description="编码用于稳定引用，名称面向现场人员显示。" onClose={() => setDialogOpen(false)} onConfirm={save} saving={saving} size="lg">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="工作中心编码" required><input className={appInputClassName} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></FormField>
          <FormField label="工作中心名称" required><input className={appInputClassName} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></FormField>
          <FormField label="类别"><input className={appInputClassName} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></FormField>
          {editing && !editing.isActive && <label className="flex items-center gap-2 self-end rounded-lg border border-gray-200 px-3 py-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />恢复启用</label>}
          <FormField label="备注" className="sm:col-span-2"><textarea className={appTextareaClassName} rows={4} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></FormField>
        </div>
      </ResourceFormDialog>
    </>
  )
}
