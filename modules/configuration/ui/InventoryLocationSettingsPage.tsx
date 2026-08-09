'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import ConfigurationManualOrder from '@/app/components/ConfigurationManualOrder'
import FormField, { appInputClassName, appTextareaClassName } from '@/app/components/FormField'
import { ResourceFormDialog, ResourcePage, ResourceSortLabel, type ResourceTableColumn } from '@/app/components/resource'
import useClientTableSort from '@/app/components/useClientTableSort'
import { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import { filterByKeywordQuery } from '@/lib/resource-search'
import { archiveInventoryLocation, loadInventoryLocations, makeDefaultInventoryLocation, saveInventoryLocation } from '../client/reference-data-api'
import type { InventoryLocationConfig } from '../contracts/reference-data'
import { locationAdvancedFields, locationSearchProfile } from '../model/reference-data'

const emptyForm = { code: '', name: '', note: '', isDefault: false, isActive: true }

export default function InventoryLocationSettingsPage({ onMessage }: { onMessage: (message: string) => void }) {
  const [items, setItems] = useState<InventoryLocationConfig[]>([])
  const [keyword, setKeyword] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<InventoryLocationConfig | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.system.inventory-locations.viewMode', 'list')
  const filteredItems = useMemo(() => filterByKeywordQuery(items, keyword, locationSearchProfile), [items, keyword])
  const tableSort = useClientTableSort(filteredItems, {
    manual: (item) => item.sortOrder,
    location: (item) => `${item.code} ${item.name}`,
    status: (item) => item.isDefault ? '默认' : item.isActive ? '启用' : '已归档',
    materialCount: (item) => item.materialCount,
    qty: (item) => item.qty,
  }, 'manual', 'asc')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await loadInventoryLocations())
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取库位失败')
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

  const openEdit = (item: InventoryLocationConfig) => {
    setEditing(item)
    setForm({ code: item.code, name: item.name, note: item.note || '', isDefault: item.isDefault, isActive: item.isActive })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) return onMessage('请填写库位编码和名称')
    setSaving(true)
    try {
      setItems(await saveInventoryLocation(form, editing?.id))
      setDialogOpen(false)
      onMessage(editing ? '库位已更新' : '库位已新增')
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存库位失败')
    } finally {
      setSaving(false)
    }
  }

  const archive = async (item: InventoryLocationConfig) => {
    if (!confirm(`确认归档库位“${item.code} · ${item.name}”吗？`)) return
    try {
      setItems(await archiveInventoryLocation(item.id))
      onMessage('库位已归档')
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '归档库位失败')
    }
  }

  const makeDefault = async (item: InventoryLocationConfig) => {
    try {
      setItems(await makeDefaultInventoryLocation(item.id))
      onMessage(`默认库位已设为 ${item.code}`)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '设置默认库位失败')
    }
  }

  const statusBadge = (item: InventoryLocationConfig) => item.isDefault
    ? <span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">默认</span>
    : <span className={`rounded px-2 py-1 text-xs ${item.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{item.isActive ? '启用' : '已归档'}</span>

  const actions = (item: InventoryLocationConfig) => <div className="flex justify-end gap-2"><AppButton size="sm" onClick={() => openEdit(item)}>编辑</AppButton>{item.isActive && !item.isDefault && <><AppButton size="sm" variant="primary" onClick={() => void makeDefault(item)}>设为默认</AppButton><AppButton size="sm" variant="warning" onClick={() => void archive(item)}>归档</AppButton></>}</div>
  const columns: ResourceTableColumn<InventoryLocationConfig>[] = [
    { key: 'location', label: <ResourceSortLabel column="location" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>库位</ResourceSortLabel>, render: (item) => <div><div className="font-medium text-gray-900">{item.code} · {item.name}</div>{item.note && <div className="mt-1 text-xs text-gray-500">{item.note}</div>}</div> },
    { key: 'status', label: <ResourceSortLabel column="status" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>状态</ResourceSortLabel>, render: statusBadge },
    { key: 'materialCount', label: <ResourceSortLabel column="materialCount" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>物料数</ResourceSortLabel>, render: (item) => item.materialCount, hideBelow: 'sm' },
    { key: 'qty', label: <ResourceSortLabel column="qty" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>库存 / 占用 / 可用</ResourceSortLabel>, render: (item) => <span className="font-mono">{item.qty} / {item.reservedQty} / {item.availableQty}</span>, hideBelow: 'md' },
    { key: 'actions', label: <span className="block text-right">操作</span>, render: actions, className: 'text-right' },
  ]

  return (
    <>
      <ResourcePage resourceKey="inventory-locations" title="库位配置" description="总库存继续统一核算；库位用于来料、生产订单实绩和发货的实物数量分布与校验。" items={tableSort.sortedRows} getKey={(item) => item.id} columns={columns}
        renderCard={({ item }) => <article className={`h-full rounded-xl border bg-white p-4 shadow-sm ${item.isActive ? 'border-gray-200' : 'border-gray-200 opacity-70'}`}><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-gray-900">{item.code} · {item.name}</h2><p className="mt-1 text-xs text-gray-500">{item.note || '暂无备注'}</p></div>{statusBadge(item)}</div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-gray-500">物料数</dt><dd>{item.materialCount}</dd></div><div><dt className="text-xs text-gray-500">库存 / 可用</dt><dd className="font-mono">{item.qty} / {item.availableQty}</dd></div></dl><div className="mt-4">{actions(item)}</div></article>}
        loading={loading} emptyLabel="暂无库位" searchValue={keyword} onSearchChange={setKeyword} searchPlaceholder="输入库位编码、名称或备注；空格分隔多个关键词" advancedSearchFields={locationAdvancedFields}
        actions={<ConfigurationManualOrder entity="locations" label="库位" onMessage={onMessage} onSaved={load} />} viewMode={viewMode} onViewModeChange={setViewMode} displayModes={['card', 'list']} onCreate={openCreate} createLabel="新建库位" summary={<span className="text-sm text-gray-500">共 {filteredItems.length} 项</span>} rowLabel={(item) => `库位 ${item.code} ${item.name}`} />

      <ResourceFormDialog open={dialogOpen} editing={Boolean(editing)} createTitle="新建库位" editTitle="编辑库位" description="库位编码用于业务单据和库存分布，默认库位必须保持启用。" onClose={() => setDialogOpen(false)} onConfirm={save} saving={saving}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><FormField label="库位编码" required><input className={appInputClassName} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></FormField><FormField label="库位名称" required><input className={appInputClassName} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></FormField><FormField label="备注" className="sm:col-span-2"><textarea className={appTextareaClassName} rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></FormField><label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} />设为默认库位</label>{editing && <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.isActive} disabled={editing.isDefault || editing.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />{editing.isActive ? '已启用（请使用归档操作停用）' : '恢复启用'}</label>}</div>
      </ResourceFormDialog>
    </>
  )
}
