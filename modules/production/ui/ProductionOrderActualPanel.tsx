'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import EmployeeMultiSelect, { EmployeeChoice } from './EmployeeMultiSelect'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import SearchableSelect from '@/app/components/SearchableSelect'
import { appInputClassName, appTextareaClassName } from '@/app/components/FormField'
import { calculateProductionConsumption, ProductionLossMode } from '@/lib/production-consumption'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import { MaterialRelationIdentity, MaterialRelationSearch, OneToManyRelationField, type MaterialRelationOption } from '@/app/components/relations'
import {
  confirmProductionOrderActual,
  createProductionOrderActual,
  deleteProductionOrderActual,
  loadProductionOrderActuals,
  reverseProductionOrderActual,
} from '../client/production-order-api'
import { productionOrderActualCreationError } from '../domain/production-order-status'
import { QualityLotCard, type QualityLotView } from '@/modules/quality'
import {
  ProductionActualExecutionContextPicker,
  ProductionActualExecutionContextSummary,
  type ProductionActualEquipmentOption,
  type ProductionActualEquipmentSnapshot,
  type ProductionActualWorkInstructionOption,
  type ProductionActualWorkInstructionSnapshot,
} from './ProductionActualExecutionContext'

type BomSnapshot = {
  id: string
  name: string
  version: string
  outputQuantity?: number
  outputs: Array<{
    id: string
    materialId: string
    quantity: number
    unit: string
    isPrimary: boolean
    material: { code: string; name: string; stockUnit: string; unit: string }
  }>
  items: Array<{
    id: string
    materialId: string
    outputMaterialId?: string | null
    quantity: number
    unit: string
    material: { code: string; name: string; stockUnit: string; unit: string }
  }>
}

type ActualRecord = {
  id: string
  actualNo: string
  actualDate: string
  workers: string
  note?: string | null
  equipmentExceptionReason?: string | null
  workInstructionExceptionReason?: string | null
  equipmentSnapshots: ProductionActualEquipmentSnapshot[]
  workInstructionSnapshots: ProductionActualWorkInstructionSnapshot[]
  status: 'DRAFT' | 'CONFIRMED' | 'REVERSED'
  inputs: Array<{
    id: string
    bomItemId?: string | null
    materialCode: string
    materialName: string
    actualQty: number
    unit: string
    location: { code: string; name: string }
    lotAllocations?: Array<{
      id: string
      stockQty: number
      status: string
      lot: { id: string; lotNo: string; supplierLotNo?: string | null; sourceType: string; status: string }
      location: { code: string; name: string }
    }>
  }>
  outputs: Array<{
    id: string
    bomOutputId?: string | null
    materialId: string
    materialCode: string
    materialName: string
    actualQty: number
    unit: string
    isPrimary: boolean
    location: { code: string; name: string }
    inventoryLot?: QualityLotView | null
  }>
}

type ActualData = {
  order: {
    id: string
    orderNo: string
    materialId?: string | null
    status: string
    planQty: number
    completeQty: number
    bomName?: string | null
    bomVersion?: string | null
    bomSnapshot: BomSnapshot | null
    targetMaterial?: MaterialRelationOption | null
    actuals: ActualRecord[]
  }
  locations: Array<{ id: string; code: string; name: string; isDefault: boolean }>
  employees: EmployeeChoice[]
  materials: MaterialRelationOption[]
  executionContext: {
    workCenterIds: string[]
    equipment: ProductionActualEquipmentOption[]
    workInstructions: ProductionActualWorkInstructionOption[]
  }
}

type OutputDraft = { locationId: string; actualQty: number }
type InputDraft = { locationId: string; lossMode: ProductionLossMode; lossValue: number; actualQty?: number }

const today = () => {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}
const numberText = (value: number) => Number(value || 0).toFixed(6).replace(/\.?0+$/, '')
const statusMeta = {
  DRAFT: { label: '草稿', className: 'bg-gray-100 text-gray-700' },
  CONFIRMED: { label: '已确认', className: 'bg-emerald-50 text-emerald-700' },
  REVERSED: { label: '已冲销', className: 'bg-red-50 text-red-700' },
} as const

export default function ProductionOrderActualPanel({
  orderId,
  onMessage,
  onOrderChanged,
  canQualityUpdate,
  canEnter,
  canDeleteDraft,
  canConfirm,
  canReverse,
}: {
  orderId: string
  onMessage: (message: string) => void
  onOrderChanged: () => void | Promise<void>
  canQualityUpdate: boolean
  canEnter: boolean
  canDeleteDraft: boolean
  canConfirm: boolean
  canReverse: boolean
}) {
  const [data, setData] = useState<ActualData | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [actualDate, setActualDate] = useState(today())
  const [employeeIds, setEmployeeIds] = useState<string[]>([])
  const [equipmentIds, setEquipmentIds] = useState<string[]>([])
  const [workInstructionIds, setWorkInstructionIds] = useState<string[]>([])
  const [equipmentExceptionReason, setEquipmentExceptionReason] = useState('')
  const [workInstructionExceptionReason, setWorkInstructionExceptionReason] = useState('')
  const [note, setNote] = useState('')
  const [outputs, setOutputs] = useState<Record<string, OutputDraft>>({})
  const [inputs, setInputs] = useState<Record<string, InputDraft>>({})
  const [confirming, setConfirming] = useState<ActualRecord | null>(null)
  const [reversing, setReversing] = useState<ActualRecord | null>(null)
  const [reverseReason, setReverseReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await loadProductionOrderActuals<ActualData>(orderId))
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取班后生产实绩失败')
    } finally {
      setLoading(false)
    }
  }, [onMessage, orderId])

  useEffect(() => { load() }, [load])

  const snapshot = data?.order.bomSnapshot || null
  const targetMaterialId = data?.order.materialId || ''
  const primaryOutput = snapshot?.outputs.find((output) => output.isPrimary && output.materialId === targetMaterialId) || null
  const primaryActualQty = Number(outputs[targetMaterialId]?.actualQty || 0)
  const primaryBasis = Number(primaryOutput?.quantity || snapshot?.outputQuantity || 1)
  const batchFactor = primaryBasis > 0 ? primaryActualQty / primaryBasis : 0

  const calculatedInputs = useMemo(() => {
    const relationsByMaterial = new Map<string, BomSnapshot['items']>()
    for (const item of snapshot?.items || []) {
      const relations = relationsByMaterial.get(item.materialId) || []
      relations.push(item)
      relationsByMaterial.set(item.materialId, relations)
    }
    return Object.keys(inputs).map((materialId) => {
      const relations = relationsByMaterial.get(materialId) || []
      const item = relations[0]
      const material = data?.materials.find((candidate) => candidate.id === materialId) || {
        id: materialId,
        code: item?.material.code || materialId,
        name: item?.material.name || '未知物料',
        unit: item?.material.unit,
        stockUnit: item?.material.stockUnit,
      }
      const draft = inputs[materialId]
      const sharedBatchInputs = relations.filter((relation) => !relation.outputMaterialId)
      const plannedBaseQty = sharedBatchInputs.length > 0
        ? sharedBatchInputs.reduce((sum, relation) => sum + Number(relation.quantity), 0) * batchFactor
        : relations.reduce((sum, relation) => {
            const targetOutput = snapshot?.outputs.find((output) => output.materialId === relation.outputMaterialId)
            const targetActualQty = Number(outputs[targetOutput?.materialId || '']?.actualQty || 0)
            const outputBasis = Number(targetOutput?.quantity || 0)
            return outputBasis > 0 ? sum + targetActualQty * Number(relation.quantity) / outputBasis : sum
          }, 0)
      const calculated = plannedBaseQty > 0
      ? calculateProductionConsumption({
          outputQty: primaryActualQty,
          unitConsumption: primaryActualQty > 0 ? plannedBaseQty / primaryActualQty : 0,
          lossMode: draft?.lossMode || 'PERCENT',
          lossValue: Number(draft?.lossValue || 0),
          actualQty: Number(draft?.actualQty || 0) > 0 ? Number(draft.actualQty) : undefined,
        })
      : { baseQty: 0, lossQty: 0, plannedQty: 0, actualQty: Number(draft?.actualQty || 0) }
      return { material, relations, draft, calculated, unit: item?.unit || material.stockUnit || material.unit || '' }
    })
  }, [batchFactor, data?.materials, inputs, outputs, primaryActualQty, snapshot?.items, snapshot?.outputs])

  const openForm = () => {
    if (!data?.order.materialId) return onMessage('该历史生产订单没有目标物料，无法登记实绩')
    const creationError = productionOrderActualCreationError(data.order.status, data.order.materialId)
    if (creationError) return onMessage(creationError)
    const defaultLocationId = data.locations.find((location) => location.isDefault)?.id || data.locations[0]?.id || ''
    const remaining = Math.max(0, Number(data.order.planQty) - Number(data.order.completeQty))
    const main = data.order.bomSnapshot?.outputs.find((output) => output.isPrimary)
    const factor = main && remaining > 0 ? remaining / Number(main.quantity || 1) : 1
    const presetOutputs = data.order.bomSnapshot?.outputs || [{ materialId: data.order.materialId, quantity: remaining || data.order.planQty }]
    setOutputs(Object.fromEntries(presetOutputs.map((output) => [output.materialId, {
      locationId: defaultLocationId,
      actualQty: Number((Number(output.quantity) * factor).toFixed(6)),
    }])))
    setInputs(Object.fromEntries((data.order.bomSnapshot?.items || []).map((item) => [item.materialId, {
      locationId: defaultLocationId,
      lossMode: 'PERCENT' as const,
      lossValue: 0,
    }])))
    setActualDate(today())
    setEmployeeIds([])
    setEquipmentIds([])
    setWorkInstructionIds([])
    setEquipmentExceptionReason('')
    setWorkInstructionExceptionReason('')
    setNote('')
    setFormOpen(true)
  }

  const saveDraft = async () => {
    if (!targetMaterialId) return onMessage('生产订单目标物料无效')
    if (employeeIds.length === 0) return onMessage('请选择生产员工')
    if (equipmentIds.length === 0 && equipmentExceptionReason.trim().length < 2) return onMessage('请选择实际设备或填写设备例外原因')
    if (workInstructionIds.length === 0 && workInstructionExceptionReason.trim().length < 2) return onMessage('请选择作业文件或填写作业文件例外原因')
    if (primaryActualQty <= 0) return onMessage('主产出实际数量必须大于 0')
    if (Object.keys(inputs).length === 0) return onMessage('请至少添加一项实际投入')
    if (!outputs[targetMaterialId]) return onMessage('目标产出不能移除')
    if (Object.values(outputs).some((output) => !output.locationId)) return onMessage('请选择每项产出的入库库位')
    if (Object.values(inputs).some((input) => !input.locationId)) return onMessage('请选择每项投入物料的来源库位')
    if (calculatedInputs.some((line) => line.calculated.actualQty <= 0)) return onMessage('投入实际数量必须大于 0')
    const presetInputs = new Set((snapshot?.items || []).map((item) => item.materialId))
    const presetOutputs = new Set((snapshot?.outputs || []).map((output) => output.materialId))
    const inputIds = new Set(Object.keys(inputs))
    const outputIds = new Set(Object.keys(outputs))
    const hasBomDeviation = Object.keys(inputs).some((id) => !presetInputs.has(id))
      || Object.keys(outputs).some((id) => !presetOutputs.has(id))
      || Array.from(presetInputs).some((id) => !inputIds.has(id))
      || Array.from(presetOutputs).some((id) => !outputIds.has(id))
    if ((!snapshot || hasBomDeviation) && note.trim().length < 2) return onMessage('临时生产或计划外投入产出必须填写备注')
    setSaving(true)
    try {
      const payload = await createProductionOrderActual(orderId, {
          actualDate,
          employeeIds,
          equipmentIds,
          equipmentExceptionReason: equipmentIds.length === 0 ? equipmentExceptionReason.trim() : undefined,
          workInstructionIds,
          workInstructionExceptionReason: workInstructionIds.length === 0 ? workInstructionExceptionReason.trim() : undefined,
          note,
          outputs: Object.entries(outputs).map(([materialId, output]) => ({
            materialId,
            locationId: output.locationId,
            actualQty: Number(output.actualQty),
          })),
          inputs: calculatedInputs.map(({ material, draft, calculated }) => ({
            materialId: material.id,
            locationId: draft.locationId,
            lossMode: draft.lossMode,
            lossValue: Number(draft.lossValue || 0),
            actualQty: Number(calculated.actualQty),
          })),
      })
      onMessage(payload.message || '班后生产实绩草稿已保存')
      setFormOpen(false)
      await load()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存班后生产实绩失败')
    } finally {
      setSaving(false)
    }
  }

  const confirmActual = async () => {
    if (!confirming) return
    setSaving(true)
    try {
      const payload = await confirmProductionOrderActual(orderId, confirming.id)
      onMessage(payload.message || '班后生产实绩已确认')
      setConfirming(null)
      await load()
      await onOrderChanged()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '确认班后生产实绩失败')
    } finally {
      setSaving(false)
    }
  }

  const deleteDraft = async (actual: ActualRecord) => {
    setSaving(true)
    try {
      const payload = await deleteProductionOrderActual(orderId, actual.id)
      onMessage(payload.message || '草稿已删除')
      await load()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '删除草稿失败')
    } finally {
      setSaving(false)
    }
  }

  const reverseActual = async () => {
    if (!reversing) return
    if (!reverseReason.trim()) return onMessage('请填写冲销原因')
    setSaving(true)
    try {
      const payload = await reverseProductionOrderActual(orderId, reversing.id, reverseReason.trim())
      onMessage(payload.message || '班后生产实绩已冲销')
      setReversing(null)
      setReverseReason('')
      await load()
      await onOrderChanged()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '冲销班后生产实绩失败')
    } finally {
      setSaving(false)
    }
  }

  if (!data) return loading
    ? <AppLoadingIndicator compact label="正在加载班后生产实绩..." className="rounded-lg border border-gray-200 bg-gray-50" />
    : <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">暂无班后生产实绩数据</div>

  return (
    <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">班后生产实绩</h3>
          <p className="mt-1 text-sm text-gray-500">BOM 只预填标准转换关系；实际投入和产出可增删，无 BOM 订单也可登记临时生产。</p>
        </div>
        {canEnter && <AppButton
          variant="create"
          onClick={openForm}
          disabled={loading || Boolean(productionOrderActualCreationError(data.order.status, data.order.materialId))}
        >登记班后产量</AppButton>}
      </div>

      <div className="mt-4 space-y-3">
        {data.order.actuals.length === 0 && <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">尚未登记班后生产实绩</div>}
        {data.order.actuals.map((actual) => {
          const meta = statusMeta[actual.status]
          return (
            <article key={actual.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-blue-700">{actual.actualNo}</span>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${meta.className}`}>{meta.label}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{actual.actualDate.slice(0, 10)} · {actual.workers || '未填写员工'}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {actual.status === 'DRAFT' && <>
                    {canDeleteDraft && <AppButton size="sm" variant="danger" onClick={() => deleteDraft(actual)} disabled={saving}>删除草稿</AppButton>}
                    {canConfirm && <AppButton size="sm" variant="primary" onClick={() => setConfirming(actual)} disabled={saving}>确认并更新库存</AppButton>}
                  </>}
                  {canReverse && actual.status === 'CONFIRMED' && <AppButton size="sm" variant="danger" onClick={() => { setReversing(actual); setReverseReason('') }} disabled={saving}>冲销</AppButton>}
                </div>
              </div>
              <ProductionActualExecutionContextSummary
                equipmentSnapshots={actual.equipmentSnapshots}
                workInstructionSnapshots={actual.workInstructionSnapshots}
                equipmentExceptionReason={actual.equipmentExceptionReason}
                workInstructionExceptionReason={actual.workInstructionExceptionReason}
              />
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-md bg-gray-50 p-3 text-sm">
                  <div className="mb-2 font-medium text-gray-700">投入物料</div>
                  {actual.inputs.map((line) => <div key={line.id} className="py-1 text-gray-600"><div className="flex justify-between gap-3"><span>{line.materialCode} · {line.materialName}<span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${line.bomItemId ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{line.bomItemId ? 'BOM 预设' : '临时添加'}</span></span><span className="shrink-0">{numberText(line.actualQty)} {line.unit} · {line.location.code}</span></div>{(line.lotAllocations || []).length > 0 && <div className="mt-1 space-y-1 pl-2 text-xs text-slate-500">{line.lotAllocations!.map((allocation) => <div key={allocation.id} className="flex flex-wrap justify-between gap-2"><span className="font-mono">批次 {allocation.lot.lotNo}{allocation.lot.supplierLotNo ? ` · 供应批号 ${allocation.lot.supplierLotNo}` : allocation.lot.sourceType === 'LEGACY_INVENTORY' ? ' · 历史未追踪' : ''}</span><span>{numberText(allocation.stockQty)} {line.unit}</span></div>)}</div>}</div>)}
                </div>
                <div className="rounded-md bg-blue-50/60 p-3 text-sm">
                  <div className="mb-2 font-medium text-blue-800">产出物料</div>
                  {actual.outputs.map((line) => <div key={line.id} className="py-1 text-blue-800"><div className="flex justify-between gap-3"><span>{line.isPrimary ? '主产出 · ' : ''}{line.materialCode} · {line.materialName}<span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${line.bomOutputId ? 'bg-blue-100 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{line.bomOutputId ? 'BOM 预设' : '临时添加'}</span></span><span className="shrink-0">{numberText(line.actualQty)} {line.unit} · {line.location.code}</span></div>{line.inventoryLot && <QualityLotCard lot={line.inventoryLot} canDecide={canQualityUpdate} onMessage={onMessage} onChanged={load} />}</div>)}
                </div>
              </div>
              {actual.note && <div className="mt-3 text-sm text-gray-500">备注：{actual.note}</div>}
            </article>
          )
        })}
      </div>

      {formOpen && (
        <ModalDialog
          title="登记班后生产实绩"
          description={`${data.order.orderNo} · ${snapshot ? `${data.order.bomName || snapshot.name} ${data.order.bomVersion || snapshot.version} · BOM 仅作预填` : '临时生产 / 转换（无 BOM）'}`}
          onClose={() => !saving && setFormOpen(false)}
          closeDisabled={saving}
          size="wide"
          footer={<ModalActions onCancel={() => setFormOpen(false)} onConfirm={saveDraft} confirmLabel="保存实绩草稿" busy={saving} />}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">生产日期
              <input type="date" value={actualDate} onChange={(event) => setActualDate(event.target.value)} className={`${appInputClassName} mt-2`} />
            </label>
            <div className="text-sm font-medium text-gray-700">生产员工
              <div className="mt-2"><EmployeeMultiSelect value={employeeIds} options={data.employees} onChange={setEmployeeIds} /></div>
            </div>
          </div>

          <ProductionActualExecutionContextPicker
            equipmentOptions={data.executionContext.equipment}
            workInstructionOptions={data.executionContext.workInstructions}
            equipmentIds={equipmentIds}
            workInstructionIds={workInstructionIds}
            equipmentExceptionReason={equipmentExceptionReason}
            workInstructionExceptionReason={workInstructionExceptionReason}
            onEquipmentIdsChange={setEquipmentIds}
            onWorkInstructionIdsChange={setWorkInstructionIds}
            onEquipmentExceptionReasonChange={setEquipmentExceptionReason}
            onWorkInstructionExceptionReasonChange={setWorkInstructionExceptionReason}
          />

          <div className="mt-5 grid overflow-hidden rounded-lg border border-gray-200 xl:grid-cols-2 xl:divide-x">
            <OneToManyRelationField
              title="实际投入"
              items={calculatedInputs}
              getKey={(line) => line.material.id}
              emptyText="请至少添加一项实际投入"
              selector={<MaterialRelationSearch materials={data.materials} disabledIds={Object.keys(inputs)} onAdd={(materialId) => setInputs((current) => ({ ...current, [materialId]: { locationId: data.locations.find((location) => location.isDefault)?.id || data.locations[0]?.id || '', lossMode: 'PERCENT', lossValue: 0, actualQty: 0 } }))} placeholder="添加临时或计划内投入物料" />}
              renderIdentity={({ material, relations, draft, calculated, unit }) => <div><MaterialRelationIdentity material={material} fallbackId={material.id} badge={<span className={`rounded px-1.5 py-0.5 text-[10px] ${relations.length ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{relations.length ? 'BOM 预设' : '临时添加'}</span>} /><div className="mt-3 grid gap-2 sm:grid-cols-2"><SearchableSelect value={draft.locationId} onChange={(locationId) => setInputs((current) => ({ ...current, [material.id]: { ...current[material.id], locationId } }))} options={data.locations.map((location) => ({ value: location.id, label: `${location.code} · ${location.name}` }))} placeholder="来源库位" />{relations.length > 0 && <SearchableSelect value={draft.lossMode} onChange={(lossMode) => setInputs((current) => ({ ...current, [material.id]: { ...current[material.id], lossMode: lossMode as ProductionLossMode } }))} options={[{ value: 'PERCENT', label: '损耗：按百分比' }, { value: 'FIXED_PER_UNIT', label: '损耗：每主产出固定增加' }]} placeholder="损耗方式" />} {relations.length > 0 && <input aria-label="额外耗用值" type="number" min="0" step="0.000001" value={draft.lossValue} onChange={(event) => setInputs((current) => ({ ...current, [material.id]: { ...current[material.id], lossValue: Number(event.target.value) } }))} className={appInputClassName} placeholder="额外耗用值" />}<input aria-label={`实际投入 ${material.name}`} type="number" min="0.000001" step="0.000001" value={draft.actualQty ?? calculated.actualQty} onChange={(event) => setInputs((current) => ({ ...current, [material.id]: { ...current[material.id], actualQty: Number(event.target.value) } }))} className={appInputClassName} placeholder={`实际投入（${unit}）`} /></div><div className="mt-2 text-xs text-gray-500">{relations.length ? `BOM 比例计划 ${numberText(calculated.plannedQty)} ${unit}，损耗 ${numberText(calculated.lossQty)} ${unit}` : '无 BOM 计划数，按实际数量领用'}</div></div>}
              onRemove={(line) => setInputs((current) => { const next = { ...current }; delete next[line.material.id]; return next })}
            />

            <OneToManyRelationField
              title="实际产出"
              items={Object.keys(outputs)}
              getKey={(materialId) => materialId}
              emptyText="目标产出不能为空"
              selector={<MaterialRelationSearch materials={data.materials} disabledIds={Object.keys(outputs)} onAdd={(materialId) => setOutputs((current) => ({ ...current, [materialId]: { locationId: data.locations.find((location) => location.isDefault)?.id || data.locations[0]?.id || '', actualQty: 0 } }))} placeholder="添加副产品、回收料或其它产出" />}
              renderIdentity={(materialId) => {
                const material = data.materials.find((candidate) => candidate.id === materialId)
                const preset = snapshot?.outputs.find((output) => output.materialId === materialId)
                const draft = outputs[materialId]
                const unit = preset?.unit || material?.stockUnit || material?.unit || ''
                return <div><MaterialRelationIdentity material={material} fallbackId={materialId} badge={<span className={`rounded px-1.5 py-0.5 text-[10px] ${preset ? 'bg-blue-100 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{materialId === targetMaterialId ? '目标主产出' : preset ? 'BOM 预设' : '临时添加'}</span>} /><div className="mt-3 grid gap-2 sm:grid-cols-2"><SearchableSelect value={draft.locationId} onChange={(locationId) => setOutputs((current) => ({ ...current, [materialId]: { ...current[materialId], locationId } }))} options={data.locations.map((location) => ({ value: location.id, label: `${location.code} · ${location.name}` }))} placeholder="入库库位" /><input aria-label={`实际产出 ${material?.name || materialId}`} type="number" min={materialId === targetMaterialId ? '0.000001' : '0'} step="0.000001" value={draft.actualQty} onChange={(event) => setOutputs((current) => ({ ...current, [materialId]: { ...current[materialId], actualQty: Number(event.target.value) } }))} className={appInputClassName} placeholder={`实际产出（${unit}）`} /></div><div className="mt-2 text-xs text-gray-500">{preset ? `BOM 比例计划 ${numberText(Number(preset.quantity) * batchFactor)} ${unit}` : '无 BOM 计划数，作为本次实际产出'}</div></div>
              }}
              onRemove={(materialId) => materialId === targetMaterialId ? onMessage('生产订单目标主产出不能移除') : setOutputs((current) => { const next = { ...current }; delete next[materialId]; return next })}
            />
          </div>

          <label className="mt-5 block text-sm font-medium text-gray-700">备注
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className={`${appTextareaClassName} mt-2`} placeholder="班次、异常或其它说明；无 BOM 或存在临时投入产出时必填" />
          </label>
        </ModalDialog>
      )}

      {confirming && (
        <ModalDialog title="确认班后生产实绩" description={`${confirming.actualNo} · 确认后按库位可用批次先进先出分配投入，并为全部产出生成待检批次和投入产出谱系。`} onClose={() => !saving && setConfirming(null)} closeDisabled={saving} size="sm" footer={<ModalActions onCancel={() => setConfirming(null)} onConfirm={confirmActual} confirmLabel="确认并生成批次谱系" busy={saving} />}>
          <p className="text-sm text-gray-600">系统会扣减投入、增加产出总库存、生成内部批次和质量检验任务；产出在质量放行前不计入可用库存。库存不足时整笔事务不会生效。</p>
        </ModalDialog>
      )}

      {reversing && (
        <ModalDialog title="冲销班后生产实绩" description={reversing.actualNo} onClose={() => !saving && setReversing(null)} closeDisabled={saving} size="sm" footer={<ModalActions onCancel={() => setReversing(null)} onConfirm={reverseActual} confirmLabel="确认冲销" confirmVariant="danger" busy={saving} />}>
          <label className="block text-sm font-medium text-gray-700">冲销原因
            <textarea value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} rows={3} className={`${appTextareaClassName} mt-2`} placeholder="说明冲销原因" />
          </label>
        </ModalDialog>
      )}
    </section>
  )
}
