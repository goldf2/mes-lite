'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import FormField, { appInputClassName } from '@/app/components/FormField'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import SortableTableHeader from '@/app/components/SortableTableHeader'
import useClientTableSort from '@/app/components/useClientTableSort'
import useCompactViewport from '@/app/components/useCompactViewport'
import { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import { filterByResourceSearch, type ResourceSearchCondition } from '@/lib/resource-search'
import { loadEngineeringMaterials, loadProcessTemplates, saveProcessTemplate } from '../client/production-engineering-api'
import type { ProcessTemplate } from '../contracts/production-engineering'
import {
  emptyProcessTemplateForm,
  processCategoryLabel,
  processCategoryOptions,
  processCostPerThousand,
  processTemplateAdvancedFields,
  processTemplateSearchProfile,
} from '../model/production-engineering'
import ProductionEngineeringPageShell from './ProductionEngineeringPageShell'

const costFields = [
  ['standardBatchQty', '标准批量', '件'], ['setupTimeMinutes', '每批准备时间', '分钟'], ['cycleTimeSeconds', '单件节拍', '秒/件'],
  ['peopleCount', '操作人数', '人'], ['laborRatePerHour', '人工小时费率', '元/h'], ['machineCount', '设备数量', '台'],
  ['machineRatePerHour', '设备机时费率', '元/h'], ['energyCostPerHour', '每小时能源费', '元/h'], ['consumableCostPerBatch', '每批耗材费', '元/批'], ['yieldRate', '标准合格率', '%'],
] as const

export default function ProcessTemplatePage({ onMessage, actions }: { onMessage: (message: string) => void; actions?: ReactNode }) {
  const [templates, setTemplates] = useState<ProcessTemplate[]>([])
  const [materials, setMaterials] = useState<Array<{ id: string; code: string; name: string }>>([])
  const [keyword, setKeyword] = useState('')
  const [conditions, setConditions] = useState<ResourceSearchCondition[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ProcessTemplate | null>(null)
  const [form, setForm] = useState(emptyProcessTemplateForm)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.system.processTemplates.viewMode', 'card')
  const effectiveViewMode = useCompactViewport(1023) ? 'card' : viewMode

  const filteredTemplates = useMemo(() => filterByResourceSearch(templates, keyword, processTemplateSearchProfile, processTemplateAdvancedFields, conditions), [conditions, keyword, templates])
  const templateSort = useClientTableSort(filteredTemplates, {
    manual: (template) => template.sortOrder,
    name: (template) => `${template.code} ${template.name}`,
    category: (template) => processCategoryLabel[template.category] || template.category,
    workstation: (template) => template.workstation,
    materials: (template) => template.materials.length,
  }, 'manual', 'asc')

  const load = useCallback(async () => {
    const [templateResult, materialResult] = await Promise.allSettled([loadProcessTemplates(), loadEngineeringMaterials()])
    if (templateResult.status === 'fulfilled') setTemplates(templateResult.value)
    else onMessage(templateResult.reason instanceof Error ? templateResult.reason.message : '获取加工工艺失败')
    if (materialResult.status === 'fulfilled') setMaterials(materialResult.value)
    else onMessage(materialResult.reason instanceof Error ? materialResult.reason.message : '获取关联物料失败')
  }, [onMessage])

  useEffect(() => { void load() }, [load])

  const openAdd = () => {
    setEditing(null)
    setForm(emptyProcessTemplateForm())
    setShowModal(true)
  }

  const openEdit = (template: ProcessTemplate) => {
    setEditing(template)
    setForm({
      code: template.code, name: template.name, category: template.category, defaultTime: template.defaultTime || 0,
      workstation: template.workstation || '', description: template.description || '', materialIds: template.materials.map((item) => item.id),
      standardBatchQty: template.standardBatchQty, setupTimeMinutes: template.setupTimeMinutes, cycleTimeSeconds: template.cycleTimeSeconds,
      peopleCount: template.peopleCount, laborRatePerHour: template.laborRatePerHour, machineCount: template.machineCount,
      machineRatePerHour: template.machineRatePerHour, energyCostPerHour: template.energyCostPerHour,
      consumableCostPerBatch: template.consumableCostPerBatch, yieldRate: template.yieldRate * 100,
    })
    setShowModal(true)
  }

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) return onMessage('模板编码和工艺名称必填')
    try {
      await saveProcessTemplate(form, editing?.id)
      setShowModal(false)
      onMessage(editing ? '加工工艺已更新' : '加工工艺已新增')
      await load()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存加工工艺失败')
    }
  }

  return (
    <ProductionEngineeringPageShell resourceKey="process-templates" title="加工工艺" description="按类别维护可复用工艺，并关联到物料全景。" summary={`共 ${filteredTemplates.length} 项`} keyword={keyword} onKeywordChange={setKeyword} searchPlaceholder="输入工艺编码、名称、类别、工位或关联物料" advancedFields={processTemplateAdvancedFields} conditions={conditions} onConditionsChange={setConditions} conditionLabel="加工工艺组合条件" viewMode={viewMode} onViewModeChange={setViewMode} onCreate={openAdd} resourceLabel="加工工艺" actions={actions}>
      {effectiveViewMode === 'card' ? (
        <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2">
          {templateSort.sortedRows.map((template) => {
            const thousand = processCostPerThousand(template)
            return <article key={template.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{template.name}</div><div className="mt-1 text-xs text-gray-500">{processCategoryLabel[template.category] || template.category} · {template.code}{template.isPreset ? ' · 预置' : ''}</div></div><AppButton size="sm" onClick={() => openEdit(template)}>编辑</AppButton></div>
              <div className="mt-2 text-sm text-gray-600">{template.workstation || '未设工位'}{template.defaultTime ? ` · ${template.defaultTime} 分钟` : ''}</div>
              {template.description && <div className="mt-2 text-xs text-gray-500">{template.description}</div>}
              <div className="mt-2 text-xs text-gray-500">关联物料：{template.materials.length ? template.materials.map((item) => item.code).join('、') : '暂无'}</div>
              <div className="mt-3 grid grid-cols-3 gap-2 rounded bg-blue-50 p-2 text-xs text-blue-800"><span>千件人工<br /><b>{thousand.laborHours.toFixed(2)} h</b></span><span>千件机时<br /><b>{thousand.machineHours.toFixed(2)} h</b></span><span>千件工艺成本<br /><b>¥{thousand.cost.toFixed(2)}</b></span></div>
            </article>
          })}
        </div>
      ) : (
        <div className="overflow-x-auto"><table className="w-full min-w-[760px]"><thead className="bg-gray-50 text-left text-sm text-gray-600"><tr>
          <SortableTableHeader column="name" activeColumn={templateSort.sortColumn} direction={templateSort.sortDirection} onSort={templateSort.toggleSort}>加工工艺</SortableTableHeader>
          <SortableTableHeader column="category" activeColumn={templateSort.sortColumn} direction={templateSort.sortDirection} onSort={templateSort.toggleSort}>类别</SortableTableHeader>
          <SortableTableHeader column="workstation" activeColumn={templateSort.sortColumn} direction={templateSort.sortDirection} onSort={templateSort.toggleSort}>工位</SortableTableHeader>
          <SortableTableHeader column="materials" activeColumn={templateSort.sortColumn} direction={templateSort.sortDirection} onSort={templateSort.toggleSort}>关联物料</SortableTableHeader>
          <th className="px-4 py-3 text-right">操作</th>
        </tr></thead><tbody className="divide-y divide-gray-100">{templateSort.sortedRows.map((template) => <tr key={template.id}>
          <td className="px-4 py-3"><div className="font-medium text-gray-900">{template.name}</div><div className="font-mono text-xs text-gray-500">{template.code}{template.isPreset ? ' · 预置' : ''}</div></td>
          <td className="px-4 py-3 text-sm text-gray-600">{processCategoryLabel[template.category] || template.category}</td><td className="px-4 py-3 text-sm text-gray-600">{template.workstation || '-'}</td><td className="px-4 py-3 text-sm text-gray-600">{template.materials.length}</td><td className="px-4 py-3 text-right"><AppButton size="sm" onClick={() => openEdit(template)}>编辑</AppButton></td>
        </tr>)}</tbody></table></div>
      )}
      {filteredTemplates.length === 0 && <div className="py-12 text-center text-sm text-gray-500">暂无符合条件的加工工艺</div>}

      {showModal && <ModalDialog title={editing ? '编辑加工工艺' : '新建加工工艺'} description="维护可复用工艺参数，并可关联适用物料。" onClose={() => setShowModal(false)} size="lg" footer={<ModalActions onCancel={() => setShowModal(false)} onConfirm={submit} confirmLabel="保存" />}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="模板编码" required><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className={appInputClassName} /></FormField>
          <FormField label="工艺名称" required><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={appInputClassName} /></FormField>
          <FormField label="类别"><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={appInputClassName}>{processCategoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField>
          <FormField label="默认工时（分钟）"><input type="number" min="0" value={form.defaultTime || ''} onChange={(event) => setForm({ ...form, defaultTime: Number(event.target.value) })} className={appInputClassName} /></FormField>
          <FormField label="默认工位"><input value={form.workstation} onChange={(event) => setForm({ ...form, workstation: event.target.value })} className={appInputClassName} /></FormField>
          <FormField label="说明"><input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={appInputClassName} /></FormField>
        </div>
        <section className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4"><div className="mb-3 font-medium text-blue-900">千件工时、机时与成本参数</div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{costFields.map(([key, label, unit]) => <label key={key} className="text-xs text-gray-600">{label}<div className="mt-1 flex overflow-hidden rounded border border-gray-200 bg-white"><input type="number" min="0" step="any" value={form[key] || ''} onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) })} className="min-w-0 flex-1 px-2 py-2 text-sm outline-none" /><span className="border-l bg-gray-50 px-2 py-2">{unit}</span></div></label>)}</div></section>
        <section className="mt-4"><div className="mb-2 text-sm font-medium">关联物料（可多选）</div><div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-3">{materials.map((material) => <label key={material.id} className="flex gap-2 text-sm"><input type="checkbox" checked={form.materialIds.includes(material.id)} onChange={(event) => setForm({ ...form, materialIds: event.target.checked ? [...form.materialIds, material.id] : form.materialIds.filter((id) => id !== material.id) })} />{material.code} · {material.name}</label>)}</div></section>
      </ModalDialog>}
    </ProductionEngineeringPageShell>
  )
}
