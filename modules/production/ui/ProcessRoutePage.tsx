'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import FormField, { appInputClassName } from '@/app/components/FormField'
import { MaterialChoiceSearch } from '@/modules/materials'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import SearchableSelect from '@/app/components/SearchableSelect'
import SortableTableHeader from '@/app/components/SortableTableHeader'
import useClientTableSort from '@/app/components/useClientTableSort'
import useCompactViewport from '@/app/components/useCompactViewport'
import { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import { filterByResourceSearch, type ResourceSearchCondition } from '@/lib/resource-search'
import { loadEngineeringProducts, loadProcessRoutes, loadProcessTemplates, saveProcessRoute } from '../client/production-engineering-api'
import type { MaterialChoice, ProcessRoute, ProcessRouteForm, ProcessStepForm, ProcessTemplate } from '../contracts/production-engineering'
import {
  displayMaterialCode,
  emptyProcessRouteForm,
  emptyProcessStep,
  processCostPerThousand,
  processRouteAdvancedFields,
  processRouteSearchProfile,
  routeCostPerThousand,
} from '../model/production-engineering'
import ProductionEngineeringPageShell from './ProductionEngineeringPageShell'

export default function ProcessRoutePage({ onMessage, actions }: { onMessage: (message: string) => void; actions?: ReactNode }) {
  const [routes, setRoutes] = useState<ProcessRoute[]>([])
  const [products, setProducts] = useState<MaterialChoice[]>([])
  const [templates, setTemplates] = useState<ProcessTemplate[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingRoute, setEditingRoute] = useState<ProcessRoute | null>(null)
  const [saving, setSaving] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [conditions, setConditions] = useState<ResourceSearchCondition[]>([])
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.system.process.viewMode', 'list')
  const [form, setForm] = useState<ProcessRouteForm>(emptyProcessRouteForm)
  const effectiveViewMode = useCompactViewport(1023) ? 'card' : viewMode

  const filteredRoutes = useMemo(() => filterByResourceSearch(routes, keyword, processRouteSearchProfile, processRouteAdvancedFields, conditions), [conditions, keyword, routes])
  const routeSort = useClientTableSort(filteredRoutes, {
    manual: (route) => route.sortOrder,
    material: (route) => `${displayMaterialCode(route.product?.sku)} ${route.product?.name || ''}`,
    name: (route) => route.name,
    default: (route) => route.isDefault,
    steps: (route) => route.steps.length,
  }, 'manual', 'asc')

  const load = useCallback(async () => {
    const [routeResult, productResult, templateResult] = await Promise.allSettled([loadProcessRoutes(), loadEngineeringProducts(), loadProcessTemplates()])
    if (routeResult.status === 'fulfilled') setRoutes(routeResult.value)
    else onMessage(routeResult.reason instanceof Error ? routeResult.reason.message : '获取工艺路线失败')
    if (productResult.status === 'fulfilled') setProducts(productResult.value)
    else onMessage(productResult.reason instanceof Error ? productResult.reason.message : '获取物料失败')
    if (templateResult.status === 'fulfilled') setTemplates(templateResult.value)
    else onMessage(templateResult.reason instanceof Error ? templateResult.reason.message : '获取加工工艺失败')
  }, [onMessage])

  useEffect(() => { void load() }, [load])

  const resetForm = () => {
    setEditingRoute(null)
    setForm(emptyProcessRouteForm())
  }

  const openAdd = () => {
    resetForm()
    setShowModal(true)
  }

  const openEdit = (route: ProcessRoute) => {
    const materialOption = products.find((product) => product.sku === route.product?.sku || `MAT-${product.sku}` === route.product?.sku)
    setEditingRoute(route)
    setForm({
      productId: materialOption?.id || route.productId,
      name: route.name,
      isDefault: route.isDefault,
      steps: route.steps.length ? route.steps.map((step) => ({
        stepNo: step.stepNo, name: step.name, defaultTime: step.defaultTime || 0, workstation: step.workstation || '', description: step.description || '',
        templateId: step.templateId || '', templateCode: step.templateCode || '', standardBatchQty: step.standardBatchQty,
        setupTimeMinutes: step.setupTimeMinutes, cycleTimeSeconds: step.cycleTimeSeconds, peopleCount: step.peopleCount,
        laborRatePerHour: step.laborRatePerHour, machineCount: step.machineCount, machineRatePerHour: step.machineRatePerHour,
        energyCostPerHour: step.energyCostPerHour, consumableCostPerBatch: step.consumableCostPerBatch, yieldRate: step.yieldRate,
      })) : [emptyProcessStep()],
    })
    setShowModal(true)
  }

  const updateStep = (index: number, patch: Partial<ProcessStepForm>) => setForm((current) => ({ ...current, steps: current.steps.map((step, currentIndex) => currentIndex === index ? { ...step, ...patch } : step) }))

  const applyTemplate = (index: number, templateId: string) => {
    const template = templates.find((item) => item.id === templateId)
    if (!template) return updateStep(index, { templateId: '', templateCode: '' })
    updateStep(index, {
      templateId: template.id, templateCode: template.code, name: template.name, workstation: template.workstation || '', description: template.description || '',
      defaultTime: template.defaultTime || 0, standardBatchQty: template.standardBatchQty, setupTimeMinutes: template.setupTimeMinutes,
      cycleTimeSeconds: template.cycleTimeSeconds, peopleCount: template.peopleCount, laborRatePerHour: template.laborRatePerHour,
      machineCount: template.machineCount, machineRatePerHour: template.machineRatePerHour, energyCostPerHour: template.energyCostPerHour,
      consumableCostPerBatch: template.consumableCostPerBatch, yieldRate: template.yieldRate,
    })
  }

  const addStep = () => {
    const nextNo = form.steps.length ? Math.max(...form.steps.map((step) => step.stepNo)) + 1 : 1
    setForm({ ...form, steps: [...form.steps, { ...emptyProcessStep(), stepNo: nextNo }] })
  }

  const removeStep = (index: number) => {
    if (form.steps.length <= 1) return onMessage('至少需要一个工序')
    setForm({ ...form, steps: form.steps.filter((_, currentIndex) => currentIndex !== index) })
  }

  const submit = async () => {
    if (!form.productId || !form.name || form.steps.some((step) => !step.name || step.stepNo <= 0)) return onMessage('物料、路线名称、工序号和工序名称必填')
    setSaving(true)
    try {
      await saveProcessRoute(form, editingRoute?.id)
      onMessage(editingRoute ? '工艺路线已更新' : '工艺路线已创建')
      setShowModal(false)
      resetForm()
      setRoutes(await loadProcessRoutes())
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存工艺路线失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ProductionEngineeringPageShell resourceKey="process-routes" title="BOM／工艺路线" description="维护物料工艺路线和工序。已产生派工或报工的工序不建议直接修改。" summary={`共 ${filteredRoutes.length} 项`} keyword={keyword} onKeywordChange={setKeyword} searchPlaceholder="输入物料编码、名称、路线或工序；空格分隔多个关键词" advancedFields={processRouteAdvancedFields} conditions={conditions} onConditionsChange={setConditions} conditionLabel="工艺路线组合条件" viewMode={viewMode} onViewModeChange={setViewMode} onCreate={openAdd} resourceLabel="工艺路线" actions={actions}>
      {effectiveViewMode === 'card' && filteredRoutes.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-2">{routeSort.sortedRows.map((route) => {
          const totals = routeCostPerThousand(route)
          return <article key={route.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-gray-900">{route.name}</div><div className="mt-1 text-sm text-gray-500">{route.product?.name} ({displayMaterialCode(route.product?.sku)})</div></div><div className="flex items-center gap-2">{route.isDefault && <span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">默认</span>}<AppButton size="sm" onClick={() => openEdit(route)}>编辑</AppButton></div></div>
            <div className="mt-3 grid grid-cols-3 gap-2 rounded bg-blue-50 p-2 text-xs text-blue-800"><span>千件人工<br /><b>{totals.laborHours.toFixed(2)} h</b></span><span>千件机时<br /><b>{totals.machineHours.toFixed(2)} h</b></span><span>千件路线成本<br /><b>¥{totals.cost.toFixed(2)}</b></span></div>
            <div className="mt-4 space-y-2">{route.steps.map((step) => <div key={step.id} className="rounded bg-gray-50 p-3 text-sm"><div className="font-medium text-gray-900">{step.stepNo}. {step.name}</div><div className="mt-1 text-xs text-gray-500">{step.workstation ? `工位：${step.workstation}` : '未设工位'}{step.defaultTime ? ` · ${step.defaultTime} 分钟` : ''}</div>{step.description && <div className="mt-1 text-xs text-gray-500">{step.description}</div>}</div>)}</div>
          </article>
        })}</div>
      ) : (
        <div className="overflow-x-auto"><table className="w-full"><thead className="bg-gray-50"><tr>
          <SortableTableHeader column="material" activeColumn={routeSort.sortColumn} direction={routeSort.sortDirection} onSort={routeSort.toggleSort}>物料</SortableTableHeader><SortableTableHeader column="name" activeColumn={routeSort.sortColumn} direction={routeSort.sortDirection} onSort={routeSort.toggleSort}>路线名称</SortableTableHeader><SortableTableHeader column="default" activeColumn={routeSort.sortColumn} direction={routeSort.sortDirection} onSort={routeSort.toggleSort}>默认</SortableTableHeader><SortableTableHeader column="steps" activeColumn={routeSort.sortColumn} direction={routeSort.sortDirection} onSort={routeSort.toggleSort}>工序</SortableTableHeader><th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
        </tr></thead><tbody className="divide-y divide-gray-100">{routeSort.sortedRows.map((route) => <tr key={route.id} className="align-top hover:bg-gray-50"><td className="px-4 py-3"><div className="text-sm font-medium">{route.product?.name}</div><div className="text-xs text-gray-500">{displayMaterialCode(route.product?.sku)}</div></td><td className="px-4 py-3 text-sm">{route.name}</td><td className="px-4 py-3 text-sm">{route.isDefault ? '是' : '-'}</td><td className="px-4 py-3 text-sm"><div className="space-y-1">{route.steps.map((step) => <div key={step.id}>{step.stepNo}. {step.name}{step.workstation ? <span className="text-gray-500"> / {step.workstation}</span> : null}{step.defaultTime ? <span className="text-gray-500"> / {step.defaultTime} 分钟</span> : null}</div>)}</div></td><td className="px-4 py-3"><AppButton size="sm" onClick={() => openEdit(route)}>编辑</AppButton></td></tr>)}</tbody></table></div>
      )}
      {filteredRoutes.length === 0 && <div className="py-12 text-center text-gray-500">暂无符合条件的工艺路线</div>}

      {showModal && <ModalDialog title={editingRoute ? '编辑工艺路线' : '新建工艺路线'} description="维护物料默认路线及其有序工序。" onClose={() => { setShowModal(false); resetForm() }} closeDisabled={saving} size="xl" footer={<ModalActions onCancel={() => { setShowModal(false); resetForm() }} onConfirm={submit} confirmLabel="保存" busy={saving} />}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><FormField label="物料" required><MaterialChoiceSearch value={form.productId} options={products} onChange={(productId) => setForm({ ...form, productId })} placeholder="输入物料编码或名称筛选" /></FormField><FormField label="路线名称" required><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={appInputClassName} /></FormField></div>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} className="h-4 w-4" />设为该物料默认工艺路线</label>
          <section><div className="mb-3 flex items-center justify-between"><h4 className="font-medium">工序列表</h4><AppButton variant="secondary" size="sm" onClick={addStep}>添加工序</AppButton></div><div className="space-y-3">{form.steps.map((step, index) => <div key={index} className="rounded-lg border border-gray-200 p-3">
            <FormField label="从可计算工艺模板加入"><SearchableSelect value={step.templateId} onChange={(templateId) => applyTemplate(index, templateId)} options={[{ value: '', label: '手工工序' }, ...templates.map((template) => ({ value: template.id, label: `${template.code} · ${template.name}` }))]} placeholder="输入模板编码或名称筛选" /></FormField>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"><FormField label="工序号" required><input type="number" value={step.stepNo || ''} onChange={(event) => updateStep(index, { stepNo: Number(event.target.value) })} className={appInputClassName} /></FormField><FormField label="工序名称" required><input value={step.name} onChange={(event) => updateStep(index, { name: event.target.value })} className={appInputClassName} /></FormField><FormField label="工位"><input value={step.workstation} onChange={(event) => updateStep(index, { workstation: event.target.value })} className={appInputClassName} /></FormField><FormField label="默认工时（分钟）"><input type="number" value={step.defaultTime || ''} onChange={(event) => updateStep(index, { defaultTime: Number(event.target.value) })} className={appInputClassName} /></FormField></div>
            <div className="mt-3"><FormField label="说明"><input value={step.description} onChange={(event) => updateStep(index, { description: event.target.value })} className={appInputClassName} /></FormField></div>
            {step.templateId && (() => { const value = processCostPerThousand(step); return <div className="mt-3 grid grid-cols-3 gap-2 rounded bg-gray-50 p-2 text-xs text-gray-600"><span>千件人工 <b>{value.laborHours.toFixed(2)}h</b></span><span>千件机时 <b>{value.machineHours.toFixed(2)}h</b></span><span>千件成本 <b>¥{value.cost.toFixed(2)}</b></span></div> })()}
            <div className="mt-3 flex justify-end"><AppButton variant="danger" size="sm" onClick={() => removeStep(index)}>移除本工序</AppButton></div>
          </div>)}</div></section>
        </div>
      </ModalDialog>}
    </ProductionEngineeringPageShell>
  )
}
