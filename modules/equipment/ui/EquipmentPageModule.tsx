'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import SearchableSelect from '@/app/components/SearchableSelect'
import { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import useClientTableSort from '@/app/components/useClientTableSort'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import AppButton from '@/app/components/AppButton'
import { appInputClassName, appSelectClassName, appTextareaClassName } from '@/app/components/FormField'
import ResourcePage from '@/app/components/resource/ResourcePage'
import ResourceSortButton from '@/app/components/resource/ResourceSortButton'
import type { ResourceAdvancedSearchField } from '@/lib/resource-search'
import { archiveEquipment, loadEquipment, loadEquipmentWorkCenters, saveEquipment } from '../client/equipment-api'
import type { EquipmentItem, EquipmentWorkCenterOption } from '../contracts/equipment'
import {
  createEmptyEquipmentForm,
  equipmentStatusLabels as statusLabels,
  equipmentStatusOptions as statusOptions,
} from '../model/equipment-view'

export default function EquipmentPageModule({
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
  const [workCenters, setWorkCenters] = useState<EquipmentWorkCenterOption[]>([])
  const [keyword, setKeyword] = useState('')
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.equipment.viewMode', 'list')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<EquipmentItem | null>(null)
  const [form, setForm] = useState(createEmptyEquipmentForm)
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
    try {
      setWorkCenters(await loadEquipmentWorkCenters())
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取工作中心失败')
    }
  }, [onMessage])

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await loadEquipment(keyword))
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取设备失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, onMessage])

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
  const advancedSearchFields = useMemo<readonly ResourceAdvancedSearchField<EquipmentItem>[]>(() => [
    { key: 'code', label: '设备编码', type: 'text', read: (item) => item.code },
    { key: 'name', label: '设备名称', type: 'text', read: (item) => item.name },
    { key: 'equipmentType', label: '设备类型', type: 'text', read: (item) => item.equipmentType },
    { key: 'workCenterId', label: '工作中心', type: 'select', read: (item) => item.workCenterId, options: workCenterOptions },
    { key: 'status', label: '状态', type: 'select', read: (item) => item.status, options: statusOptions },
    { key: 'manufacturer', label: '制造商', type: 'text', read: (item) => item.manufacturer },
    { key: 'model', label: '型号', type: 'text', read: (item) => item.model },
    { key: 'serialNumber', label: '出厂编号', type: 'text', read: (item) => item.serialNumber },
    { key: 'location', label: '现场位置', type: 'text', read: (item) => item.location },
    { key: 'basicParameters', label: '基础参数', type: 'text', read: (item) => item.basicParameters },
    { key: 'note', label: '备注', type: 'text', read: (item) => item.note },
    { key: 'createdAt', label: '创建日期', type: 'date', read: (item) => item.createdAt },
  ], [workCenterOptions])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...createEmptyEquipmentForm(), workCenterId: workCenters[0]?.id || '' })
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
      await saveEquipment(form, editing?.id)
      setShowModal(false)
      onMessage(editing ? '设备已更新' : '设备已新增')
      await loadItems()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存设备失败')
    } finally {
      setSaving(false)
    }
  }

  const archive = async (item: EquipmentItem) => {
    if (!confirm(`确认归档设备“${item.code} · ${item.name}”吗？`)) return
    try {
      const message = await archiveEquipment(item.id)
      onMessage(message || '设备已归档')
      await loadItems()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '归档设备失败')
    }
  }

  const sortLabel = (column: string, label: string) => {
    return (
      <ResourceSortButton column={column} label={label} activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort} />
    )
  }

  const columns = [
    { key: 'code', label: sortLabel('code', '编码'), render: (item: EquipmentItem) => <span className="font-mono text-blue-700">{item.code}</span> },
    { key: 'name', label: sortLabel('name', '设备名称'), render: (item: EquipmentItem) => <span className="font-medium text-gray-900">{item.name}</span> },
    { key: 'type', label: sortLabel('type', '类型'), render: (item: EquipmentItem) => item.equipmentType, hideBelow: 'md' as const },
    { key: 'workCenter', label: sortLabel('workCenter', '工作中心'), render: (item: EquipmentItem) => <><div>{item.workCenter.name}</div><div className="font-mono text-xs text-gray-400">{item.workCenter.code}</div></>, hideBelow: 'sm' as const },
    { key: 'model', label: sortLabel('model', '厂商 / 型号'), render: (item: EquipmentItem) => [item.manufacturer, item.model].filter(Boolean).join(' · ') || '-', hideBelow: 'lg' as const },
    { key: 'location', label: sortLabel('location', '位置'), render: (item: EquipmentItem) => item.location || '-', hideBelow: 'xl' as const },
    { key: 'status', label: sortLabel('status', '状态'), render: (item: EquipmentItem) => <span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">{statusLabels[item.status] || item.status}</span> },
    { key: 'actions', label: <span className="block text-right">操作</span>, headerClassName: 'text-right', className: 'text-right whitespace-nowrap', render: (item: EquipmentItem) => <>{canUpdate && <AppButton size="sm" onClick={() => openEdit(item)}>编辑</AppButton>}{canDelete && <AppButton size="sm" variant="warning" className="ml-2" onClick={() => archive(item)}>归档</AppButton>}</> },
  ]

  return (
    <>
      <ResourcePage
        resourceKey="equipment"
        title="设备台账"
        description="维护设备、状态、工作中心归属和基础能力参数。"
        items={tableSort.sortedRows}
        getKey={(item) => item.id}
        columns={columns}
        renderCard={({ item }) => (
          <>
            <div className="flex items-start justify-between gap-3"><div><div className="font-mono text-sm font-semibold text-blue-700">{item.code}</div><h3 className="mt-1 font-semibold text-gray-900">{item.name}</h3></div><span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">{statusLabels[item.status] || item.status}</span></div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-gray-600"><div><span className="text-xs text-gray-400">类型</span><div>{item.equipmentType}</div></div><div><span className="text-xs text-gray-400">工作中心</span><div>{item.workCenter.name}</div></div><div><span className="text-xs text-gray-400">型号</span><div>{item.model || '-'}</div></div><div><span className="text-xs text-gray-400">位置</span><div>{item.location || '-'}</div></div></div>
            {item.basicParameters && <div className="mt-3 line-clamp-3 whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs text-gray-600">{item.basicParameters}</div>}
            <div className="mt-4 flex justify-end gap-2">{canUpdate && <AppButton size="sm" onClick={() => openEdit(item)}>编辑</AppButton>}{canDelete && <AppButton size="sm" variant="warning" onClick={() => archive(item)}>归档</AppButton>}</div>
          </>
        )}
        loading={loading}
        loadingLabel="正在加载设备..."
        emptyLabel="暂无设备"
        emptyAction={canCreate ? <AppButton variant="create" onClick={openCreate}>新建第一台设备</AppButton> : undefined}
        searchValue={keyword}
        onSearchChange={setKeyword}
        searchPlaceholder="搜索设备编码、名称、型号或工作中心"
        advancedSearchFields={advancedSearchFields}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onCreate={canCreate ? openCreate : undefined}
        createLabel="新建设备"
        summary={<span className="text-sm text-gray-500">共 {items.length} 台</span>}
        rowLabel={(item) => `${item.code} ${item.name}`}
      />

      {showModal && (
        <ModalDialog title={editing ? '编辑设备' : '新建设备'} description="设备保存基础台账和能力参数；具体加工方法由工艺文档维护。" onClose={() => setShowModal(false)} closeDisabled={saving} size="xl" footer={<ModalActions onCancel={() => setShowModal(false)} onConfirm={save} busy={saving} />}>
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
