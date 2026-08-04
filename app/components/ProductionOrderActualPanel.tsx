'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppButton from './AppButton'
import EmployeeMultiSelect, { EmployeeChoice } from './EmployeeMultiSelect'
import ModalDialog, { ModalActions } from './ModalDialog'
import SearchableSelect from './SearchableSelect'
import { appInputClassName, appTextareaClassName } from './FormField'
import { calculateProductionConsumption, ProductionLossMode } from '@/lib/production-consumption'

type BomSnapshot = {
  id: string
  name: string
  version: string
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
  status: 'DRAFT' | 'CONFIRMED' | 'REVERSED'
  inputs: Array<{
    id: string
    materialCode: string
    materialName: string
    actualQty: number
    unit: string
    location: { code: string; name: string }
  }>
  outputs: Array<{
    id: string
    materialCode: string
    materialName: string
    actualQty: number
    unit: string
    isPrimary: boolean
    location: { code: string; name: string }
  }>
}

type ActualData = {
  order: {
    id: string
    orderNo: string
    status: string
    planQty: number
    completeQty: number
    bomName?: string | null
    bomVersion?: string | null
    bomSnapshot: BomSnapshot | null
    actuals: ActualRecord[]
  }
  locations: Array<{ id: string; code: string; name: string; isDefault: boolean }>
  employees: EmployeeChoice[]
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
}: {
  orderId: string
  onMessage: (message: string) => void
  onOrderChanged: () => void | Promise<void>
}) {
  const [data, setData] = useState<ActualData | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [actualDate, setActualDate] = useState(today())
  const [employeeIds, setEmployeeIds] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [outputs, setOutputs] = useState<Record<string, OutputDraft>>({})
  const [inputs, setInputs] = useState<Record<string, InputDraft>>({})
  const [confirming, setConfirming] = useState<ActualRecord | null>(null)
  const [reversing, setReversing] = useState<ActualRecord | null>(null)
  const [reverseReason, setReverseReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/orders/${orderId}/actuals`)
      const payload = await response.json()
      if (!response.ok) {
        onMessage(payload.error || '获取班后生产实绩失败')
        return
      }
      setData(payload.data)
    } catch {
      onMessage('获取班后生产实绩失败')
    } finally {
      setLoading(false)
    }
  }, [onMessage, orderId])

  useEffect(() => { load() }, [load])

  const snapshot = data?.order.bomSnapshot || null
  const primaryOutput = snapshot?.outputs.find((output) => output.isPrimary) || null
  const primaryActualQty = primaryOutput ? Number(outputs[primaryOutput.materialId]?.actualQty || 0) : 0
  const primaryBasis = Number(primaryOutput?.quantity || 1)
  const batchFactor = primaryBasis > 0 ? primaryActualQty / primaryBasis : 0

  const calculatedInputs = useMemo(() => {
    const relationsByMaterial = new Map<string, BomSnapshot['items']>()
    for (const item of snapshot?.items || []) {
      const relations = relationsByMaterial.get(item.materialId) || []
      relations.push(item)
      relationsByMaterial.set(item.materialId, relations)
    }
    return Array.from(relationsByMaterial.values()).map((relations) => {
      const item = relations[0]
      const draft = inputs[item.materialId]
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
      return { item, relations, draft, calculated }
    })
  }, [batchFactor, inputs, outputs, primaryActualQty, snapshot?.items, snapshot?.outputs])

  const openForm = () => {
    if (!data?.order.bomSnapshot) return onMessage('该生产订单没有 BOM 快照，请重新创建生产订单')
    if (['CANCELLED', 'COMPLETED'].includes(data.order.status)) return onMessage('已取消或已完成的生产订单不能新增实绩')
    const defaultLocationId = data.locations.find((location) => location.isDefault)?.id || data.locations[0]?.id || ''
    const remaining = Math.max(0, Number(data.order.planQty) - Number(data.order.completeQty))
    const main = data.order.bomSnapshot.outputs.find((output) => output.isPrimary)!
    const factor = remaining > 0 ? remaining / Number(main.quantity || 1) : 1
    setOutputs(Object.fromEntries(data.order.bomSnapshot.outputs.map((output) => [output.materialId, {
      locationId: defaultLocationId,
      actualQty: Number((Number(output.quantity) * factor).toFixed(6)),
    }])))
    setInputs(Object.fromEntries(data.order.bomSnapshot.items.map((item) => [item.materialId, {
      locationId: defaultLocationId,
      lossMode: 'PERCENT' as const,
      lossValue: 0,
    }])))
    setActualDate(today())
    setEmployeeIds([])
    setNote('')
    setFormOpen(true)
  }

  const saveDraft = async () => {
    if (!snapshot || !primaryOutput) return onMessage('生产订单 BOM 快照无效')
    if (employeeIds.length === 0) return onMessage('请选择生产员工')
    if (primaryActualQty <= 0) return onMessage('主产出实际数量必须大于 0')
    if (snapshot.outputs.some((output) => !outputs[output.materialId]?.locationId)) return onMessage('请选择每项产出的入库库位')
    if (snapshot.items.some((item) => !inputs[item.materialId]?.locationId)) return onMessage('请选择每项投入物料的来源库位')
    if (calculatedInputs.some((line) => line.calculated.actualQty <= 0)) return onMessage('投入实际数量必须大于 0')
    setSaving(true)
    try {
      const response = await fetch(`/api/orders/${orderId}/actuals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualDate,
          employeeIds,
          note,
          outputs: snapshot.outputs.map((output) => ({
            materialId: output.materialId,
            locationId: outputs[output.materialId].locationId,
            actualQty: Number(outputs[output.materialId].actualQty),
          })),
          inputs: calculatedInputs.map(({ item, draft, calculated }) => ({
            materialId: item.materialId,
            locationId: draft.locationId,
            lossMode: draft.lossMode,
            lossValue: Number(draft.lossValue || 0),
            actualQty: Number(calculated.actualQty),
          })),
        }),
      })
      const payload = await response.json()
      if (!response.ok) return onMessage(payload.error || '保存班后生产实绩失败')
      onMessage(payload.message || '班后生产实绩草稿已保存')
      setFormOpen(false)
      await load()
    } catch {
      onMessage('保存班后生产实绩失败')
    } finally {
      setSaving(false)
    }
  }

  const confirmActual = async () => {
    if (!confirming) return
    setSaving(true)
    try {
      const response = await fetch(`/api/orders/${orderId}/actuals/${confirming.id}/confirm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const payload = await response.json()
      if (!response.ok) return onMessage(payload.error || '确认班后生产实绩失败')
      onMessage(payload.message || '班后生产实绩已确认')
      setConfirming(null)
      await load()
      await onOrderChanged()
    } catch {
      onMessage('确认班后生产实绩失败')
    } finally {
      setSaving(false)
    }
  }

  const deleteDraft = async (actual: ActualRecord) => {
    setSaving(true)
    try {
      const response = await fetch(`/api/orders/${orderId}/actuals/${actual.id}`, { method: 'DELETE' })
      const payload = await response.json()
      if (!response.ok) return onMessage(payload.error || '删除草稿失败')
      onMessage(payload.message || '草稿已删除')
      await load()
    } catch {
      onMessage('删除草稿失败')
    } finally {
      setSaving(false)
    }
  }

  const reverseActual = async () => {
    if (!reversing) return
    if (!reverseReason.trim()) return onMessage('请填写冲销原因')
    setSaving(true)
    try {
      const response = await fetch(`/api/orders/${orderId}/actuals/${reversing.id}/reverse`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reverseReason.trim() }),
      })
      const payload = await response.json()
      if (!response.ok) return onMessage(payload.error || '冲销班后生产实绩失败')
      onMessage(payload.message || '班后生产实绩已冲销')
      setReversing(null)
      setReverseReason('')
      await load()
      await onOrderChanged()
    } catch {
      onMessage('冲销班后生产实绩失败')
    } finally {
      setSaving(false)
    }
  }

  if (!data) return <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">{loading ? '正在加载班后生产实绩…' : '暂无班后生产实绩数据'}</div>

  return (
    <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">班后生产实绩</h3>
          <p className="mt-1 text-sm text-gray-500">订单先保存基本信息；班后按订单 BOM 快照登记全部投入和产出，确认后再更新库存。</p>
        </div>
        <AppButton variant="create" onClick={openForm} disabled={loading || ['CANCELLED', 'COMPLETED'].includes(data.order.status)}>登记班后产量</AppButton>
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
                    <AppButton size="sm" variant="danger" onClick={() => deleteDraft(actual)} disabled={saving}>删除草稿</AppButton>
                    <AppButton size="sm" variant="primary" onClick={() => setConfirming(actual)} disabled={saving}>确认并更新库存</AppButton>
                  </>}
                  {actual.status === 'CONFIRMED' && <AppButton size="sm" variant="danger" onClick={() => { setReversing(actual); setReverseReason('') }} disabled={saving}>冲销</AppButton>}
                </div>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-md bg-gray-50 p-3 text-sm">
                  <div className="mb-2 font-medium text-gray-700">投入物料</div>
                  {actual.inputs.map((line) => <div key={line.id} className="flex justify-between gap-3 py-1 text-gray-600"><span>{line.materialCode} · {line.materialName}</span><span className="shrink-0">{numberText(line.actualQty)} {line.unit} · {line.location.code}</span></div>)}
                </div>
                <div className="rounded-md bg-blue-50/60 p-3 text-sm">
                  <div className="mb-2 font-medium text-blue-800">产出物料</div>
                  {actual.outputs.map((line) => <div key={line.id} className="flex justify-between gap-3 py-1 text-blue-800"><span>{line.isPrimary ? '主产出 · ' : ''}{line.materialCode} · {line.materialName}</span><span className="shrink-0">{numberText(line.actualQty)} {line.unit} · {line.location.code}</span></div>)}
                </div>
              </div>
              {actual.note && <div className="mt-3 text-sm text-gray-500">备注：{actual.note}</div>}
            </article>
          )
        })}
      </div>

      {formOpen && snapshot && (
        <ModalDialog
          title="登记班后生产实绩"
          description={`${data.order.orderNo} · ${data.order.bomName || snapshot.name} ${data.order.bomVersion || snapshot.version}`}
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

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <section className="rounded-lg border border-gray-200 p-4">
              <h4 className="font-semibold text-gray-900">投入物料</h4>
              <p className="mt-1 text-xs text-gray-500">允许原材料、半成品或已有产品作为投入；系统按每项实际产出及其专属 BOM 比例汇总计算。</p>
              <div className="mt-4 space-y-4">
                {calculatedInputs.map(({ item, draft, calculated }) => (
                  <div key={item.materialId} className="rounded-lg bg-gray-50 p-3">
                    <div className="font-medium text-gray-900">{item.material.code} · {item.material.name}</div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="mb-1 text-xs text-gray-500">来源库位</div>
                        <SearchableSelect value={draft?.locationId || ''} onChange={(locationId) => setInputs((current) => ({ ...current, [item.materialId]: { ...current[item.materialId], locationId } }))} options={data.locations.map((location) => ({ value: location.id, label: `${location.code} · ${location.name}` }))} placeholder="输入库位筛选" />
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-gray-500">计划外额外耗用</div>
                        <SearchableSelect value={draft?.lossMode || 'PERCENT'} onChange={(lossMode) => setInputs((current) => ({ ...current, [item.materialId]: { ...current[item.materialId], lossMode: lossMode as ProductionLossMode } }))} options={[{ value: 'PERCENT', label: '按基准耗用百分比' }, { value: 'FIXED_PER_UNIT', label: '每主产出单位固定增加' }]} placeholder="输入额外耗用方式筛选" />
                      </div>
                      <label className="block text-xs text-gray-500">额外耗用值
                        <input type="number" min="0" step="0.000001" value={draft?.lossValue ?? 0} onChange={(event) => setInputs((current) => ({ ...current, [item.materialId]: { ...current[item.materialId], lossValue: Number(event.target.value) } }))} className={`${appInputClassName} mt-1`} />
                      </label>
                      <label className="block text-xs text-gray-500">实际投入（{item.unit}）
                        <input type="number" min="0.000001" step="0.000001" value={draft?.actualQty ?? calculated.actualQty} onChange={(event) => setInputs((current) => ({ ...current, [item.materialId]: { ...current[item.materialId], actualQty: Number(event.target.value) } }))} className={`${appInputClassName} mt-1`} />
                      </label>
                    </div>
                    <div className="mt-2 text-xs text-gray-500">比例计划 {numberText(calculated.plannedQty)} {item.unit}，其中损耗 {numberText(calculated.lossQty)} {item.unit}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-blue-100 bg-blue-50/30 p-4">
              <h4 className="font-semibold text-gray-900">产出物料</h4>
              <p className="mt-1 text-xs text-gray-500">一次实绩可同时登记主产品、副产品、可回收料或废料。</p>
              <div className="mt-4 space-y-4">
                {snapshot.outputs.map((output) => {
                  const draft = outputs[output.materialId]
                  const plannedQty = Number(output.quantity) * batchFactor
                  return (
                    <div key={output.materialId} className="rounded-lg border border-blue-100 bg-white p-3">
                      <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-gray-900">{output.material.code} · {output.material.name}</span>{output.isPrimary && <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">主产出</span>}</div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className="mb-1 text-xs text-gray-500">入库库位</div>
                          <SearchableSelect value={draft?.locationId || ''} onChange={(locationId) => setOutputs((current) => ({ ...current, [output.materialId]: { ...current[output.materialId], locationId } }))} options={data.locations.map((location) => ({ value: location.id, label: `${location.code} · ${location.name}` }))} placeholder="输入库位筛选" />
                        </div>
                        <label className="block text-xs text-gray-500">实际产出（{output.unit}）
                          <input type="number" min={output.isPrimary ? '0.000001' : '0'} step="0.000001" value={draft?.actualQty ?? 0} onChange={(event) => setOutputs((current) => ({ ...current, [output.materialId]: { ...current[output.materialId], actualQty: Number(event.target.value) } }))} className={`${appInputClassName} mt-1`} />
                        </label>
                      </div>
                      <div className="mt-2 text-xs text-gray-500">按主产出批次计划 {numberText(plannedQty)} {output.unit}</div>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>

          <label className="mt-5 block text-sm font-medium text-gray-700">备注
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className={`${appTextareaClassName} mt-2`} placeholder="班次、异常、设备或其它说明" />
          </label>
        </ModalDialog>
      )}

      {confirming && (
        <ModalDialog title="确认班后生产实绩" description={`${confirming.actualNo} · 确认后将原子更新全部投入和产出库存。`} onClose={() => !saving && setConfirming(null)} closeDisabled={saving} size="sm" footer={<ModalActions onCancel={() => setConfirming(null)} onConfirm={confirmActual} confirmLabel="确认并更新库存" busy={saving} />}>
          <p className="text-sm text-gray-600">系统会按各明细选择的库位扣减投入、增加产出，并累计到生产订单完成数量。库存不足时整笔事务不会生效。</p>
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
