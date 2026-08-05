'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import TopBarPortal from './TopBarPortal'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import { SearchFieldWithPresets } from './SavedSearchPresets'
import SearchableSelect from './SearchableSelect'
import ViewModeToggle, { usePersistedViewMode } from './ViewModeToggle'
import SortableTableHeader from './SortableTableHeader'
import useClientTableSort from './useClientTableSort'
import ModalDialog, { ModalActions } from './ModalDialog'
import AppButton from './AppButton'
import AppLoadingIndicator from './AppLoadingIndicator'
import { appInputClassName, appSelectClassName, appTextareaClassName } from './FormField'

interface WorkCenterOption {
  id: string
  code: string
  name: string
  isActive: boolean
}

interface EquipmentItem {
  id: string
  code: string
  name: string
  equipmentType: string
  model?: string | null
  manufacturer?: string | null
  serialNumber?: string | null
  status: string
  location?: string | null
  basicParameters?: string | null
  note?: string | null
  workCenterId: string
  workCenter: WorkCenterOption
  createdAt: string
}

const statusOptions = [
  { value: 'AVAILABLE', label: '可用' },
  { value: 'IN_USE', label: '使用中' },
  { value: 'MAINTENANCE', label: '维护中' },
  { value: 'STOPPED', label: '停用' },
]
const statusLabels = Object.fromEntries(statusOptions.map((item) => [item.value, item.label]))

function createEmptyForm() {
  return {
    code: '', name: '', equipmentType: '', workCenterId: '', model: '', manufacturer: '',
    serialNumber: '', status: 'AVAILABLE', location: '', basicParameters: '', note: '',
  }
}

export default function EquipmentPage({
  onMessage,
  canCreate,
  canUpdate,
  canDelete,
}: {
  onMessage: (message: string) => void
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}) {
  const [items, setItems] = useState<EquipmentItem[]>([])
  const [workCenters, setWorkCenters] = useState<WorkCenterOption[]>([])
  const [keyword, setKeyword] = useState('')
  const [workCenterFilter, setWorkCenterFilter] = useState('')
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.equipment.viewMode', 'list')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<EquipmentItem | null>(null)
  const [form, setForm] = useState(createEmptyForm())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const tableSort = useClientTableSort(items, {
    code: (item) => item.code,
    name: (item) => item.name,
    type: (item) => item.equipmentType,
    workCenter: (item) => `${item.workCenter.code} ${item.workCenter.name}`,
    model: (item) => `${item.manufacturer || ''} ${item.model || ''}`,
    status: (item) => statusLabels[item.status] || item.status,
    location: (item) => item.location || '',
  }, 'code', 'asc')

  const loadWorkCenters = useCallback(async () => {
    const res = await fetch('/api/work-centers')
    const data = await res.json()
    if (!res.ok) return onMessage(data.error || '获取工作中心失败')
    setWorkCenters(data.data || [])
  }, [onMessage])

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (keyword.trim()) params.set('keyword', keyword.trim())
      if (workCenterFilter) params.set('workCenterId', workCenterFilter)
      const res = await fetch(`/api/equipment?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) return onMessage(data.error || '获取设备失败')
      setItems(data.data || [])
    } finally {
      setLoading(false)
    }
  }, [keyword, onMessage, workCenterFilter])

  useEffect(() => { void loadWorkCenters() }, [loadWorkCenters])
  useEffect(() => {
    const timer = setTimeout(() => { void loadItems() }, 200)
    return () => clearTimeout(timer)
  }, [loadItems])

  const workCenterOptions = useMemo(() => workCenters.map((item) => ({
    value: item.id,
    label: `${item.code} · ${item.name}`,
    keywords: item.name,
  })), [workCenters])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...createEmptyForm(), workCenterId: workCenters[0]?.id || '' })
    setShowModal(true)
  }

  const openEdit = (item: EquipmentItem) => {
    setEditing(item)
    setForm({
      code: item.code, name: item.name, equipmentType: item.equipmentType,
      workCenterId: item.workCenterId, model: item.model || '', manufacturer: item.manufacturer || '',
      serialNumber: item.serialNumber || '', status: item.status, location: item.location || '',
      basicParameters: item.basicParameters || '', note: item.note || '',
    })
    setShowModal(true)
  }

  const save = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.equipmentType.trim() || !form.workCenterId) {
      return onMessage('请填写设备编码、名称、类型并选择工作中心')
    }
    setSaving(true)
    try {
      const res = await fetch('/api/equipment', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { ...form, id: editing.id } : form),
      })
      const data = await res.json()
      if (!res.ok) return onMessage(data.error || '保存设备失败')
      setShowModal(false)
      onMessage(editing ? '设备已更新' : '设备已新增')
      await loadItems()
    } finally {
      setSaving(false)
    }
  }

  const archive = async (item: EquipmentItem) => {
    if (!confirm(`确认归档设备“${item.code} · ${item.name}”吗？`)) return
    const res = await fetch(`/api/equipment?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) return onMessage(data.error || '归档设备失败')
    onMessage(data.message || '设备已归档')
    await loadItems()
  }

  const toolbar = (
    <ResponsiveToolbarActions
      primaryFilters={<SearchFieldWithPresets storageKey="mes-lite.searchPresets.equipment" value={keyword} onChange={setKeyword} placeholder="搜索设备编码、名称、型号或工作中心" />}
      filters={<SearchableSelect value={workCenterFilter} onChange={setWorkCenterFilter} options={workCenterOptions} placeholder="输入工作中心筛选（全部）" allowClear className="w-64" />}
      actions={<><ViewModeToggle value={viewMode} onChange={setViewMode} />{canCreate && <AppButton variant="create" onClick={openCreate}>新增</AppButton>}</>}
    />
  )

  return (
    <>
      <TopBarPortal>{toolbar}</TopBarPortal>
      <section className="rounded-lg bg-white p-3 shadow sm:p-6">
        {loading ? <AppLoadingIndicator label="正在加载设备..." /> : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">暂无设备{canCreate && <div className="mt-4"><AppButton variant="create" onClick={openCreate}>新增第一台设备</AppButton></div>}</div>
        ) : viewMode === 'card' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tableSort.sortedRows.map((item) => (
              <article key={item.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3"><div><div className="font-mono text-sm font-semibold text-blue-700">{item.code}</div><h3 className="mt-1 font-semibold text-gray-900">{item.name}</h3></div><span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">{statusLabels[item.status] || item.status}</span></div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-gray-600"><div><span className="text-xs text-gray-400">类型</span><div>{item.equipmentType}</div></div><div><span className="text-xs text-gray-400">工作中心</span><div>{item.workCenter.name}</div></div><div><span className="text-xs text-gray-400">型号</span><div>{item.model || '-'}</div></div><div><span className="text-xs text-gray-400">位置</span><div>{item.location || '-'}</div></div></div>
                {item.basicParameters && <div className="mt-3 line-clamp-3 whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs text-gray-600">{item.basicParameters}</div>}
                <div className="mt-4 flex justify-end gap-2">{canUpdate && <AppButton size="sm" onClick={() => openEdit(item)}>编辑</AppButton>}{canDelete && <AppButton size="sm" variant="warning" onClick={() => archive(item)}>归档</AppButton>}</div>
              </article>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full min-w-[1040px]">
              <thead className="bg-gray-50 text-sm text-gray-600"><tr>
                <SortableTableHeader column="code" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>编码</SortableTableHeader>
                <SortableTableHeader column="name" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>设备名称</SortableTableHeader>
                <SortableTableHeader column="type" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>类型</SortableTableHeader>
                <SortableTableHeader column="workCenter" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>工作中心</SortableTableHeader>
                <SortableTableHeader column="model" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>厂商 / 型号</SortableTableHeader>
                <SortableTableHeader column="location" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>位置</SortableTableHeader>
                <SortableTableHeader column="status" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>状态</SortableTableHeader>
                <th className="px-4 py-3 text-right">操作</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">{tableSort.sortedRows.map((item) => <tr key={item.id} className="text-sm hover:bg-gray-50"><td className="px-4 py-3 font-mono text-blue-700">{item.code}</td><td className="px-4 py-3 font-medium">{item.name}</td><td className="px-4 py-3">{item.equipmentType}</td><td className="px-4 py-3"><div>{item.workCenter.name}</div><div className="font-mono text-xs text-gray-400">{item.workCenter.code}</div></td><td className="px-4 py-3">{[item.manufacturer, item.model].filter(Boolean).join(' · ') || '-'}</td><td className="px-4 py-3">{item.location || '-'}</td><td className="px-4 py-3">{statusLabels[item.status] || item.status}</td><td className="px-4 py-3 text-right">{canUpdate && <AppButton size="sm" onClick={() => openEdit(item)}>编辑</AppButton>}{canDelete && <AppButton size="sm" variant="warning" className="ml-2" onClick={() => archive(item)}>归档</AppButton>}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      {showModal && (
        <ModalDialog title={editing ? '编辑设备' : '新增设备'} description="设备保存基础台账和能力参数；具体加工方法由工艺文档维护。" onClose={() => setShowModal(false)} closeDisabled={saving} size="xl" footer={<ModalActions onCancel={() => setShowModal(false)} onConfirm={save} busy={saving} />}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium text-gray-700">设备编码 *<input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className={`mt-2 ${appInputClassName}`} /></label>
            <label className="text-sm font-medium text-gray-700">设备名称 *<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={`mt-2 ${appInputClassName}`} /></label>
            <label className="text-sm font-medium text-gray-700">设备类型 *<input value={form.equipmentType} onChange={(event) => setForm({ ...form, equipmentType: event.target.value })} className={`mt-2 ${appInputClassName}`} placeholder="如 锯床、钻床" /></label>
            <label className="text-sm font-medium text-gray-700">工作中心 *<div className="mt-2"><SearchableSelect value={form.workCenterId} onChange={(workCenterId) => setForm({ ...form, workCenterId })} options={workCenterOptions} placeholder="输入工作中心筛选" /></div></label>
            <label className="text-sm font-medium text-gray-700">状态<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className={`mt-2 ${appSelectClassName}`}>{statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="text-sm font-medium text-gray-700">现场位置<input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className={`mt-2 ${appInputClassName}`} /></label>
            <label className="text-sm font-medium text-gray-700">制造商<input value={form.manufacturer} onChange={(event) => setForm({ ...form, manufacturer: event.target.value })} className={`mt-2 ${appInputClassName}`} /></label>
            <label className="text-sm font-medium text-gray-700">型号<input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} className={`mt-2 ${appInputClassName}`} /></label>
            <label className="text-sm font-medium text-gray-700">出厂编号<input value={form.serialNumber} onChange={(event) => setForm({ ...form, serialNumber: event.target.value })} className={`mt-2 ${appInputClassName}`} /></label>
            <label className="sm:col-span-2 lg:col-span-3 text-sm font-medium text-gray-700">基础参数<textarea value={form.basicParameters} onChange={(event) => setForm({ ...form, basicParameters: event.target.value })} rows={4} className={`mt-2 ${appTextareaClassName}`} placeholder={'例如：\n最大加工尺寸：...\n主轴功率：...\n能力范围：...'} /></label>
            <label className="sm:col-span-2 lg:col-span-3 text-sm font-medium text-gray-700">备注<textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} rows={3} className={`mt-2 ${appTextareaClassName}`} /></label>
          </div>
        </ModalDialog>
      )}
    </>
  )
}
