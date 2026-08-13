'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import ConfigurationManualOrder from './ConfigurationManualOrder'
import FormField, { appInputClassName, appSelectClassName } from '@/app/components/FormField'
import { ResourceFormDialog, ResourcePage, ResourceSortLabel, type ResourceTableColumn } from '@/app/components/resource'
import useClientTableSort from '@/app/components/useClientTableSort'
import { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import { filterByKeywordQuery } from '@/lib/resource-search'
import { loadConfiguredUnits, removeConfiguredUnit, saveConfiguredUnit } from '../client/reference-data-api'
import type { ConfiguredUnit, MeasureType } from '../contracts/reference-data'
import { measureTypeOptions, unitAdvancedFields, unitSearchProfile } from '../model/reference-data'

const emptyForm = { code: '', name: '', measureType: 'LENGTH' as MeasureType, toBaseFactor: 1 }

export default function UnitSettingsPage({ onMessage, canCreate, canUpdate, canDelete }: { onMessage: (message: string) => void; canCreate: boolean; canUpdate: boolean; canDelete: boolean }) {
  const [items, setItems] = useState<ConfiguredUnit[]>([])
  const [keyword, setKeyword] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<ConfiguredUnit | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.system.units.viewMode', 'card')
  const filteredItems = useMemo(() => filterByKeywordQuery(items, keyword, unitSearchProfile), [items, keyword])
  const tableSort = useClientTableSort(filteredItems, { manual: (item) => item.sortOrder, unit: (item) => `${item.name} ${item.code}`, measure: (item) => item.measureType, factor: (item) => item.toBaseFactor, usage: (item) => item.usageCount }, 'manual', 'asc')
  const baseUnit = measureTypeOptions.find(([measure]) => measure === form.measureType)?.[2] || '基准单位'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await loadConfiguredUnits())
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取单位配置失败')
    } finally {
      setLoading(false)
    }
  }, [onMessage])

  useEffect(() => { void load() }, [load])

  const openCreate = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true) }
  const openEdit = (item: ConfiguredUnit) => { setEditing(item); setForm({ code: item.code, name: item.name, measureType: item.measureType, toBaseFactor: item.toBaseFactor }); setDialogOpen(true) }

  const save = async () => {
    if (!form.code.trim() || !form.name.trim() || !Number.isFinite(form.toBaseFactor) || form.toBaseFactor <= 0) return onMessage('请填写有效的单位编码、名称和换算系数')
    setSaving(true)
    try {
      setItems(await saveConfiguredUnit(form, editing || undefined))
      setDialogOpen(false)
      onMessage(editing ? '单位配置已更新' : '自定义单位已新建')
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存单位失败')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item: ConfiguredUnit) => {
    if (!confirm(`确认删除自定义单位“${item.name}（${item.code}）”吗？`)) return
    try {
      setItems(await removeConfiguredUnit(item))
      onMessage('自定义单位已删除')
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '删除单位失败')
    }
  }

  const measureLabel = (item: ConfiguredUnit) => measureTypeOptions.find(([value]) => value === item.measureType)?.[1] || item.measureType
  const measureBase = (item: ConfiguredUnit) => measureTypeOptions.find(([value]) => value === item.measureType)?.[2] || '基准单位'
  const actions = (item: ConfiguredUnit) => item.isPreset ? <span className="text-xs text-gray-400">系统预置</span> : <div className="flex justify-end gap-2">{canUpdate && <AppButton size="sm" onClick={() => openEdit(item)}>编辑</AppButton>}{canDelete && <AppButton size="sm" variant="danger" onClick={() => void remove(item)}>删除</AppButton>}</div>
  const columns: ResourceTableColumn<ConfiguredUnit>[] = [
    { key: 'unit', label: <ResourceSortLabel column="unit" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>单位</ResourceSortLabel>, render: (item) => <div><span className="font-medium text-gray-900">{item.name}</span><span className="ml-2 font-mono text-xs text-gray-500">{item.code}</span>{item.isPreset && <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">预置</span>}</div> },
    { key: 'measure', label: <ResourceSortLabel column="measure" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>计量方式</ResourceSortLabel>, render: measureLabel },
    { key: 'factor', label: <ResourceSortLabel column="factor" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>换算关系</ResourceSortLabel>, render: (item) => <span>1 {item.code} = {item.toBaseFactor} {measureBase(item)}</span>, hideBelow: 'sm' },
    { key: 'usage', label: <ResourceSortLabel column="usage" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>使用</ResourceSortLabel>, render: (item) => `${item.usedByMaterialCount} 个物料 · ${item.usedByBomCount} 条 BOM`, hideBelow: 'md' },
    { key: 'actions', label: <span className="block text-right">操作</span>, render: actions, className: 'text-right' },
  ]

  return (
    <>
      <ResourcePage resourceKey="units" title="单位配置" description="物料只能选择已配置单位；自定义单位必须明确换算到所属计量方式的系统基准单位。" items={tableSort.sortedRows} getKey={(item) => `${item.measureType}-${item.code}`} columns={columns}
        renderCard={({ item }) => <article className="h-full rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-gray-900">{item.name} <span className="font-mono text-sm text-gray-500">{item.code}</span></h2><p className="mt-1 text-xs text-gray-500">{measureLabel(item)} · 基准 {measureBase(item)}</p></div>{item.isPreset && <span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">预置</span>}</div><p className="mt-4 text-sm text-gray-700">1 {item.code} = {item.toBaseFactor} {measureBase(item)}</p><p className="mt-2 text-xs text-gray-500">{item.usedByMaterialCount} 个物料 · {item.usedByBomCount} 条 BOM</p><div className="mt-4 flex justify-end">{actions(item)}</div></article>}
        loading={loading} emptyLabel="暂无单位配置" searchValue={keyword} onSearchChange={setKeyword} searchPlaceholder="输入单位编码、名称或计量方式；空格分隔多个关键词" advancedSearchFields={unitAdvancedFields}
        actions={canUpdate ? <ConfigurationManualOrder entity="units" label="单位" onMessage={onMessage} onSaved={load} /> : undefined} viewMode={viewMode} onViewModeChange={setViewMode} displayModes={['card', 'list']} onCreate={canCreate ? openCreate : undefined} createLabel="新建单位" summary={<span className="text-sm text-gray-500">共 {filteredItems.length} 项</span>} rowLabel={(item) => `单位 ${item.name} ${item.code}`} />

      <ResourceFormDialog open={dialogOpen} editing={Boolean(editing)} createTitle="新建单位" editTitle="编辑单位" description={`关系定义：1 自定义单位 = 换算系数 × ${baseUnit}。已使用单位只允许修改显示名称。`} onClose={() => setDialogOpen(false)} onConfirm={save} saving={saving}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><FormField label="计量方式"><select className={appSelectClassName} value={form.measureType} disabled={Boolean(editing?.usageCount)} onChange={(event) => setForm({ ...form, measureType: event.target.value as MeasureType })}>{measureTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField><FormField label="单位编码" required><input className={appInputClassName} value={form.code} disabled={Boolean(editing?.usageCount)} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="如：ft" /></FormField><FormField label="显示名称" required><input className={appInputClassName} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="如：英尺" /></FormField><FormField label={`换算到 ${baseUnit}`}><input className={appInputClassName} type="number" min="0" step="any" disabled={Boolean(editing?.usageCount)} value={form.toBaseFactor || ''} onChange={(event) => setForm({ ...form, toBaseFactor: Number(event.target.value) })} /></FormField></div>
      </ResourceFormDialog>
    </>
  )
}
