'use client'

import { useState } from 'react'
import AppButton from '@/app/components/AppButton'
import { appInputClassName, appTextareaClassName } from '@/app/components/FormField'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import { InventoryLotTraceDialog } from '@/modules/inventory'
import { decideProductionQualityInspection } from '../client/production-order-api'

export type ProductionQualityLotView = {
  id: string
  lotNo: string
  status: string
  balances: Array<{
    id: string
    inventoryStatus: string
    stockQty: number
    valuationQty: number
    costAmount: number
  }>
  inspections: Array<{
    id: string
    inspectionNo: string
    status: string
    result: string
    inspectedQty: number
    sampleQty: number
    goodQty: number
    badQty: number
    inspector?: string | null
    checkedAt?: string | null
    note?: string | null
  }>
  childGenealogies?: Array<{
    id: string
    parentLot: {
      id: string
      lotNo: string
      sourceType: string
      sourceId: string
      supplierLotNo?: string | null
      status: string
    }
    inputAllocation: {
      stockQty: number
      actualInput: {
        id: string
        materialCode: string
        materialName: string
        unit: string
      }
    }
  }>
}

const statusMeta = {
  AVAILABLE: { label: '已放行', className: 'bg-emerald-100 text-emerald-800' },
  QUARANTINE: { label: '待检', className: 'bg-amber-100 text-amber-800' },
  HOLD: { label: '冻结', className: 'bg-red-100 text-red-800' },
} as const

const numberText = (value: number) => Number(value || 0).toFixed(6).replace(/\.?0+$/, '')

export default function ProductionQualityLotCard({
  lot,
  canDecide,
  onChanged,
  onMessage,
}: {
  lot: ProductionQualityLotView
  canDecide: boolean
  onChanged: () => void | Promise<void>
  onMessage: (message: string) => void
}) {
  const [decision, setDecision] = useState<'PASS' | 'FAIL' | null>(null)
  const [sampleQty, setSampleQty] = useState(0)
  const [goodQty, setGoodQty] = useState(0)
  const [badQty, setBadQty] = useState(0)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [traceOpen, setTraceOpen] = useState(false)
  const balance = lot.balances.find((item) => Number(item.stockQty) > 0.000001) || lot.balances[0]
  const inspection = lot.inspections[0]
  const ancestors = lot.childGenealogies || []
  const meta = statusMeta[balance?.inventoryStatus as keyof typeof statusMeta]

  const openDecision = (nextDecision: 'PASS' | 'FAIL') => {
    if (!inspection) return onMessage('该批次没有质量检验任务')
    const defaultSample = Number(inspection.inspectedQty)
    setDecision(nextDecision)
    setSampleQty(defaultSample)
    setGoodQty(nextDecision === 'PASS' ? defaultSample : 0)
    setBadQty(nextDecision === 'FAIL' ? defaultSample : 0)
    setNote(nextDecision === 'PASS' ? '抽检合格，整批放行' : '')
  }

  const submit = async () => {
    if (!decision || !inspection) return
    setSaving(true)
    try {
      const payload = await decideProductionQualityInspection(inspection.id, {
        decision, sampleQty: Number(sampleQty), goodQty: Number(goodQty), badQty: Number(badQty), note,
      })
      onMessage(payload.message || (decision === 'PASS' ? '整批库存已放行' : '整批库存已冻结'))
      setDecision(null)
      await onChanged()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存质量判定失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2 rounded-md border border-blue-100 bg-white/80 px-3 py-2 text-xs text-gray-600">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-mono font-medium text-gray-800">批次 {lot.lotNo}</span>
          {meta && <span className={`ml-2 rounded px-2 py-0.5 font-medium ${meta.className}`}>{meta.label}</span>}
          {lot.status === 'REVERSED' && <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 font-medium text-gray-600">已冲销</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <AppButton size="sm" variant="secondary" onClick={() => setTraceOpen(true)}>查看谱系</AppButton>
          {canDecide && inspection?.status === 'PENDING' && balance?.inventoryStatus === 'QUARANTINE' && (<>
            <AppButton size="sm" variant="primary" onClick={() => openDecision('PASS')} disabled={saving}>合格放行</AppButton>
            <AppButton size="sm" variant="danger" onClick={() => openDecision('FAIL')} disabled={saving}>不合格冻结</AppButton>
          </>)}
        </div>
      </div>
      <div className="mt-1">状态数量 {numberText(balance?.stockQty || 0)} · 检验单 {inspection?.inspectionNo || '-'}</div>
      {inspection?.status === 'COMPLETED' && (
        <div className="mt-1 text-gray-500">
          判定 {inspection.result === 'PASS' ? '合格' : '不合格'} · 抽检 {numberText(inspection.sampleQty)} · 合格 {numberText(inspection.goodQty)} · 不合格 {numberText(inspection.badQty)} · {inspection.inspector || '未知检验员'}
        </div>
      )}
      {ancestors.length > 0 && (
        <details className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
          <summary className="cursor-pointer font-medium text-slate-700">投入批次谱系 · {ancestors.length} 条</summary>
          <div className="mt-2 space-y-1.5">
            {ancestors.map((item) => (
              <div key={item.id} className="rounded bg-white px-2 py-1.5 text-slate-600">
                <div className="flex flex-wrap justify-between gap-2">
                  <span>{item.inputAllocation.actualInput.materialCode} · {item.inputAllocation.actualInput.materialName}</span>
                  <span>{numberText(item.inputAllocation.stockQty)} {item.inputAllocation.actualInput.unit}</span>
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                  来源批次 {item.parentLot.lotNo}{item.parentLot.supplierLotNo ? ` · 供应批号 ${item.parentLot.supplierLotNo}` : item.parentLot.sourceType === 'LEGACY_INVENTORY' ? ' · 历史未追踪库存' : ''}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {decision && inspection && (
        <ModalDialog
          title={decision === 'PASS' ? '合格放行批次' : '不合格冻结批次'}
          description={`${inspection.inspectionNo} · ${lot.lotNo} · 本次为整批库存状态判定`}
          onClose={() => !saving && setDecision(null)}
          closeDisabled={saving}
          size="sm"
          footer={<ModalActions onCancel={() => setDecision(null)} onConfirm={submit} confirmLabel={decision === 'PASS' ? '确认整批放行' : '确认整批冻结'} confirmVariant={decision === 'PASS' ? 'create' : 'danger'} busy={saving} />}
        >
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-xs font-medium text-gray-700">抽检数量<input type="number" min="0.000001" max={inspection.inspectedQty} step="0.000001" value={sampleQty} onChange={(event) => setSampleQty(Number(event.target.value))} className={`${appInputClassName} mt-1`} /></label>
            <label className="block text-xs font-medium text-gray-700">合格数量<input type="number" min="0" step="0.000001" value={goodQty} onChange={(event) => setGoodQty(Number(event.target.value))} className={`${appInputClassName} mt-1`} /></label>
            <label className="block text-xs font-medium text-gray-700">不合格数量<input type="number" min="0" step="0.000001" value={badQty} onChange={(event) => setBadQty(Number(event.target.value))} className={`${appInputClassName} mt-1`} /></label>
          </div>
          <p className="mt-3 text-xs text-gray-500">合格数量与不合格数量之和必须等于抽检数量；整批合格时不合格样本必须为 0。</p>
          <label className="mt-4 block text-sm font-medium text-gray-700">检验结论说明<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className={`${appTextareaClassName} mt-2`} placeholder={decision === 'PASS' ? '例如：关键尺寸抽检符合图纸要求' : '请记录不合格现象和冻结原因'} /></label>
        </ModalDialog>
      )}
      {traceOpen && <InventoryLotTraceDialog lotId={lot.id} onClose={() => setTraceOpen(false)} onMessage={onMessage} />}
    </div>
  )
}
