'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import SharedCustomerDirectory from './SharedCustomerDirectory'
import { loadCustomerDirectory } from '../client/customer-master-api'
import AppButton from '@/app/components/AppButton'
import ConfigurationManualOrder from './ConfigurationManualOrder'
import FormField, { appInputClassName, appTextareaClassName } from '@/app/components/FormField'
import { ResourceFormDialog, ResourcePage, ResourceSortLabel, type ResourceTableColumn } from '@/app/components/resource'
import useClientTableSort from '@/app/components/useClientTableSort'
import { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import { filterByKeywordQuery } from '@/lib/resource-search'
import { archiveParty, loadParties, saveParty } from '../client/reference-data-api'
import type { PartyKind, PartyRecord } from '../contracts/reference-data'
import { partyAdvancedFields, partySearchProfile } from '../model/reference-data'

const partyDefinitions = {
  supplier: {
    resourceKey: 'suppliers',
    entity: 'suppliers' as const,
    label: '供应商',
    title: '供应商管理',
    description: '用于来料单选择供应商，不再使用的供应商只能归档。',
    formDescription: '供应商内部编码由系统自动维护。',
  },
  customer: {
    resourceKey: 'customers',
    entity: 'customers' as const,
    label: '客户',
    title: '客户管理',
    description: '用于按最终客户筛选物料、库存和发货记录。',
    formDescription: '客户资料用于物料归属、库存筛选和发货信息。',
  },
}

const emptyForm = { name: '', contact: '', phone: '', address: '' }

export default function PartySettingsPage({ kind, onMessage, canCreate, canUpdate, canDelete }: { kind: PartyKind; onMessage: (message: string) => void; canCreate: boolean; canUpdate: boolean; canDelete: boolean }) {
  const definition = partyDefinitions[kind]
  const [items, setItems] = useState<PartyRecord[]>([])
  const [keyword, setKeyword] = useState('')
  const [editing, setEditing] = useState<PartyRecord | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sharedMode, setSharedMode] = useState<boolean | null>(null)
  const [managementHref, setManagementHref] = useState<string | null>(null)
  const sharedCustomers = kind === 'customer' && sharedMode === true
  const localMaintenance = kind === 'supplier' || sharedMode === false
  const showLocalContactFields = kind === 'supplier' || sharedMode === false
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = usePersistedViewMode(`mes-lite.system.${definition.resourceKey}.viewMode`, 'list')
  const filteredItems = useMemo(() => filterByKeywordQuery(items, keyword, partySearchProfile), [items, keyword])
  const tableSort = useClientTableSort(filteredItems, {
    manual: (item) => item.sortOrder,
    name: (item) => item.name,
    contact: (item) => item.contact,
    phone: (item) => item.phone,
    address: (item) => item.address,
    createdAt: (item) => new Date(item.createdAt),
  }, 'manual', 'asc')

  const load = useCallback(async () => {
    setLoading(true)
    setSharedMode(null)
    setManagementHref(null)
    try {
      if (kind === 'customer') {
        const result = await loadCustomerDirectory()
        setItems(result.data)
        setSharedMode(Boolean(result.customerMaster?.enabled))
        setManagementHref(result.customerMaster?.managementHref || null)
      } else {
        setItems(await loadParties(kind))
        setSharedMode(false)
        setManagementHref(null)
      }
    } catch (error) {
      onMessage(error instanceof Error ? error.message : `获取${definition.label}失败`)
    } finally {
      setLoading(false)
    }
  }, [definition.label, kind, onMessage])

  useEffect(() => { void load() }, [load])

  const openCreate = () => {
    if (!localMaintenance) return
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (item: PartyRecord) => {
    if (!localMaintenance || item.master) return
    setEditing(item)
    setForm({ name: item.name, contact: item.contact || '', phone: item.phone || '', address: item.address || '' })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!localMaintenance) return onMessage('客户统一在数据平台维护。')
    if (!form.name.trim()) return onMessage(`${definition.label}名称必填`)
    setSaving(true)
    try {
      await saveParty(kind, form, editing?.id)
      setDialogOpen(false)
      onMessage(editing ? `${definition.label}已更新` : `${definition.label}已创建`)
      await load()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : `保存${definition.label}失败`)
    } finally {
      setSaving(false)
    }
  }

  const archive = async (item: PartyRecord) => {
    if (!localMaintenance || item.master) return onMessage('客户统一在数据平台维护。')
    if (!confirm(`确定归档${definition.label}「${item.name}」吗？归档后可在归档记录中恢复。`)) return
    try {
      await archiveParty(kind, item.id)
      onMessage(`${definition.label}已归档`)
      await load()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : `归档${definition.label}失败`)
    }
  }

  const recordStatus = (item: PartyRecord) => item.master
    ? item.master.status === 'current' ? '共享客户 · 数据平台维护' : '共享资料暂不可用'
    : sharedCustomers ? '历史客户 · 待关联正式主档' : ''

  const itemActions = (item: PartyRecord) => <div className="flex flex-wrap justify-end gap-2">
    {item.master ? <>
      <SharedCustomerDirectory customerId={item.id} enterpriseId={item.master.enterpriseId} canLink={false} onLinked={load} onMessage={onMessage} />
      {item.master.managementHref && <a href={item.master.managementHref} target="_blank" rel="noreferrer" className="self-center text-sm text-blue-700 hover:underline">在数据平台维护</a>}
    </> : <>
      {sharedCustomers && canUpdate && <SharedCustomerDirectory customerId={item.id} canLink onLinked={load} onMessage={onMessage} />}
      {localMaintenance && canUpdate && <AppButton size="sm" onClick={() => openEdit(item)}>编辑</AppButton>}
      {localMaintenance && canDelete && <AppButton size="sm" variant="warning" onClick={() => void archive(item)}>归档</AppButton>}
    </>}
  </div>

  const columns: ResourceTableColumn<PartyRecord>[] = [
    { key: 'name', label: <ResourceSortLabel column="name" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>名称</ResourceSortLabel>, render: (item) => <div><div className="font-medium text-gray-900">{item.name}</div>{recordStatus(item) && <div className="text-xs text-teal-700">{recordStatus(item)}</div>}<div className="font-mono text-xs text-blue-700">{item.code}</div></div> },
    ...(showLocalContactFields ? [
      { key: 'contact', label: <ResourceSortLabel column="contact" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>联系人</ResourceSortLabel>, render: (item: PartyRecord) => item.contact || '-', hideBelow: 'sm' as const },
      { key: 'phone', label: <ResourceSortLabel column="phone" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>电话</ResourceSortLabel>, render: (item: PartyRecord) => item.phone || '-', hideBelow: 'md' as const },
      { key: 'address', label: <ResourceSortLabel column="address" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>地址</ResourceSortLabel>, render: (item: PartyRecord) => <span className="line-clamp-2">{item.address || '-'}</span>, hideBelow: 'lg' as const },
    ] : []),
    { key: 'createdAt', label: <ResourceSortLabel column="createdAt" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>创建时间</ResourceSortLabel>, render: (item) => new Date(item.createdAt).toLocaleString('zh-CN'), hideBelow: 'xl' },
    { key: 'actions', label: <span className="block text-right">操作</span>, render: itemActions, className: 'text-right' },
  ]

  return (
    <>
      <ResourcePage
        resourceKey={definition.resourceKey}
        title={definition.title}
        description={sharedCustomers ? '客户、联系人和地点统一在数据平台维护；MES 只保留业务关联和单据快照。历史客户需明确关联后才能用于新发货单。' : definition.description}
        items={tableSort.sortedRows}
        getKey={(item) => item.id}
        columns={columns}
        renderCard={({ item }) => (
          <article className="h-full rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="truncate font-semibold text-gray-900">{item.name}</h2>
            <p className="font-mono text-xs text-blue-700">{item.code}</p>
            {recordStatus(item) && <p className="mt-2 text-sm text-teal-700">{recordStatus(item)}</p>}
            {showLocalContactFields && <><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-gray-500">联系人</dt><dd className="mt-1">{item.contact || '-'}</dd></div><div><dt className="text-xs text-gray-500">电话</dt><dd className="mt-1">{item.phone || '-'}</dd></div></dl><p className="mt-3 line-clamp-2 text-sm text-gray-600">地址：{item.address || '-'}</p></>}
            <div className="mt-4">{itemActions(item)}</div>
          </article>
        )}
        loading={loading}
        emptyLabel={`暂无符合条件的${definition.label}`}
        searchValue={keyword}
        onSearchChange={setKeyword}
        searchPlaceholder={sharedCustomers ? "输入客户编码或名称；联系人与地点可在共享资料中搜索" : "输入编码、名称、联系人、电话或地址；空格分隔多个关键词"}
        advancedSearchFields={showLocalContactFields ? partyAdvancedFields : partyAdvancedFields.filter(field => field.key === 'code' || field.key === 'name')}
        actions={<>{sharedCustomers&&<SharedCustomerDirectory canLink={canCreate} onLinked={load} onMessage={onMessage}/>}{sharedCustomers&&managementHref&&<a className="self-center text-sm text-blue-700 hover:underline" href={managementHref} target="_blank" rel="noreferrer">在数据平台维护</a>}{canUpdate&&<ConfigurationManualOrder entity={definition.entity} label={definition.label} onMessage={onMessage} onSaved={load}/>}</>}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        displayModes={['card', 'list']}
        onCreate={canCreate && localMaintenance && !loading ? openCreate : undefined}
        createLabel={`新建${definition.label}`}
        summary={<span className="text-sm text-gray-500">共 {filteredItems.length} 项</span>}
        rowLabel={(item) => `${definition.label} ${item.name}`}
      />

      <ResourceFormDialog open={dialogOpen && localMaintenance} editing={Boolean(editing)} createTitle={`新建${definition.label}`} editTitle={`编辑${definition.label}`} description={definition.formDescription} onClose={() => setDialogOpen(false)} onConfirm={save} saving={saving}>
        <div className="space-y-4">
          <FormField label={`${definition.label}名称`} required><input className={appInputClassName} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><FormField label="联系人"><input className={appInputClassName} value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} /></FormField><FormField label="电话"><input className={appInputClassName} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></FormField></div>
          <FormField label="地址"><textarea className={appTextareaClassName} rows={3} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></FormField>
        </div>
      </ResourceFormDialog>
    </>
  )
}
