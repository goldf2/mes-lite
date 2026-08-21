'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import useClientTableSort from '@/app/components/useClientTableSort'
import AppButton from '@/app/components/AppButton'
import ResourcePage from '@/app/components/resource/ResourcePage'
import ResourceSortButton from '@/app/components/resource/ResourceSortButton'
import { resourceAdvancedFields } from '@/lib/resource-search'
import { archiveEquipment, loadEquipment, loadEquipmentWorkCenters } from '../client/equipment-api'
import type { EquipmentItem, EquipmentWorkCenterOption } from '../contracts/equipment'
import {
  equipmentStatusLabels as statusLabels,
  equipmentStatusOptions as statusOptions,
  buildEquipmentSearchCatalog,
} from '../model/equipment-view'
import EquipmentEditorDialog from './EquipmentEditorDialog'
import EquipmentEventDialog from './EquipmentEventDialog'

export default function EquipmentPageModule({
  onMessage,
  canCreate,
  canUpdate,
  canDelete,
  canCommand,
}: {
  onMessage: (message: string) => void
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  canCommand: boolean
}) {
  const [items, setItems] = useState<EquipmentItem[]>([])
  const [workCenters, setWorkCenters] = useState<EquipmentWorkCenterOption[]>([])
  const [keyword, setKeyword] = useState('')
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.equipment.viewMode', 'list')
  const [showEditor, setShowEditor] = useState(false)
  const [editing, setEditing] = useState<EquipmentItem | null>(null)
  const [eventEquipment, setEventEquipment] = useState<EquipmentItem | null>(null)
  const [loading, setLoading] = useState(false)
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
  const searchCatalog = useMemo(() => buildEquipmentSearchCatalog(workCenterOptions), [workCenterOptions])
  const advancedSearchFields = useMemo(() => resourceAdvancedFields(searchCatalog), [searchCatalog])

  const openCreate = () => {
    setEditing(null)
    setShowEditor(true)
  }

  const openEdit = (item: EquipmentItem) => {
    setEditing(item)
    setShowEditor(true)
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
    { key: 'actions', label: <span className="block text-right">操作</span>, headerClassName: 'text-right', className: 'text-right whitespace-nowrap', render: (item: EquipmentItem) => <><AppButton size="sm" onClick={() => setEventEquipment(item)}>事件 {item._count.events || ''}</AppButton>{canUpdate && <AppButton size="sm" className="ml-2" onClick={() => openEdit(item)}>编辑</AppButton>}{canDelete && <AppButton size="sm" variant="warning" className="ml-2" onClick={() => archive(item)}>归档</AppButton>}</> },
  ]

  return (
    <>
      <ResourcePage
        resourceKey="equipment"
        title="设备台账"
        description="维护设备基础资料、工作中心归属，并通过事件命令留痕运行状态变化。"
        items={tableSort.sortedRows}
        getKey={(item) => item.id}
        columns={columns}
        renderCard={({ item }) => (
          <>
            <div className="flex items-start justify-between gap-3"><div><div className="font-mono text-sm font-semibold text-blue-700">{item.code}</div><h3 className="mt-1 font-semibold text-gray-900">{item.name}</h3></div><span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">{statusLabels[item.status] || item.status}</span></div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-gray-600"><div><span className="text-xs text-gray-400">类型</span><div>{item.equipmentType}</div></div><div><span className="text-xs text-gray-400">工作中心</span><div>{item.workCenter.name}</div></div><div><span className="text-xs text-gray-400">型号</span><div>{item.model || '-'}</div></div><div><span className="text-xs text-gray-400">位置</span><div>{item.location || '-'}</div></div></div>
            {item.basicParameters && <div className="mt-3 line-clamp-3 whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs text-gray-600">{item.basicParameters}</div>}
            <div className="mt-4 flex justify-end gap-2"><AppButton size="sm" onClick={() => setEventEquipment(item)}>事件 {item._count.events || ''}</AppButton>{canUpdate && <AppButton size="sm" onClick={() => openEdit(item)}>编辑</AppButton>}{canDelete && <AppButton size="sm" variant="warning" onClick={() => archive(item)}>归档</AppButton>}</div>
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

      {showEditor && <EquipmentEditorDialog equipment={editing} workCenters={workCenters} onClose={() => setShowEditor(false)} onSaved={loadItems} onMessage={onMessage} />}
      {eventEquipment && <EquipmentEventDialog equipment={eventEquipment} canCommand={canCommand} onClose={() => setEventEquipment(null)} onChanged={loadItems} onMessage={onMessage} />}
    </>
  )
}
