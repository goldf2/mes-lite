'use client'

import { useState } from 'react'
import AppButton from '@/app/components/AppButton'
import { appInputClassName, appTextareaClassName } from '@/app/components/FormField'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import { InventoryLotTraceDialog } from '@/modules/inventory'
import { decideQualityInspection, disposeQualityInspection } from '../client/quality-inspection-api'
import { selectPrimaryQualityBalance } from '../domain/quality-balance-selection'

export type QualityLotView = {
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
    round?: number
    dispositions?: Array<{
      id: string
      dispositionNo: string
      action: string
      stockQty: number
      reason: string
      performedBy: string
      performedAt: string
    }>
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
  REWORK: { label: '返工中', className: 'bg-violet-100 text-violet-800' },
} as const

type DispositionAction = 'REINSPECT' | 'CONCESSION' | 'REWORK_START' | 'REWORK_COMPLETE' | 'SCRAP' | 'UNFREEZE'

const dispositionMeta: Record<DispositionAction, { label: string; confirm: string }> = {
  REINSPECT: { label: '申请复检', confirm: '确认送复检' },
  CONCESSION: { label: '让步放行', confirm: '确认让步放行' },
  REWORK_START: { label: '转返工', confirm: '确认转返工' },
  REWORK_COMPLETE: { label: '返工完成送检', confirm: '确认返工完成送检' },
  SCRAP: { label: '报废', confirm: '确认报废' },
  UNFREEZE: { label: '解冻放行', confirm: '确认解冻放行' },
}

const dispositionActionLabels: Record<string, string> = {
  DECISION_RELEASE: '判定放行',
  DECISION_HOLD: '判定冻结',
  REINSPECT: '申请复检',
  CONCESSION: '让步放行',
  REWORK_START: '转返工',
  REWORK_COMPLETE: '返工完成送检',
  SCRAP: '报废',
  UNFREEZE: '解冻放行',
}

const numberText = (value: number) => Number(value || 0).toFixed(6).replace(/\.?0+$/, '')

export default function QualityLotCard({
  lot,
  canDecide,
  canDispose = false,
  canRelease = false,
  onChanged,
  onMessage,
}: {
  lot: QualityLotView
  canDecide: boolean
  canDispose?: boolean
  canRelease?: boolean
  onChanged: () => void | Promise<void>
  onMessage: (message: string) => void
}) {
  const [decision, setDecision] = useState<'PASS' | 'FAIL' | 'PARTIAL' | null>(null)
  const [sampleQty, setSampleQty] = useState(0)
  const [goodQty, setGoodQty] = useState(0)
  const [badQty, setBadQty] = useState(0)
  const [releaseQty, setReleaseQty] = useState(0)
  const [holdQty, setHoldQty] = useState(0)
  const [dispositionAction, setDispositionAction] = useState<DispositionAction | null>(null)
  const [dispositionQty, setDispositionQty] = useState(0)
  const [dispositionReason, setDispositionReason] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [traceOpen, setTraceOpen] = useState(false)
  const inspection = lot.inspections[0]
  const positiveBalances = lot.balances.filter((item) => Number(item.stockQty) > 0.000001)
  const balance = selectPrimaryQualityBalance(lot.balances, inspection?.status)
  const holdBalance = positiveBalances.find((item) => item.inventoryStatus === 'HOLD')
  const reworkBalance = positiveBalances.find((item) => item.inventoryStatus === 'REWORK')
  const ancestors = lot.childGenealogies || []
  const meta = statusMeta[balance?.inventoryStatus as keyof typeof statusMeta]

  const openDecision = (nextDecision: 'PASS' | 'FAIL' | 'PARTIAL') => {
    if (!inspection) return onMessage('该批次没有质量检验任务')
    const defaultSample = Number(inspection.inspectedQty)
    setDecision(nextDecision)
    setSampleQty(defaultSample)
    setGoodQty(nextDecision === 'FAIL' ? 0 : defaultSample)
    setBadQty(nextDecision === 'PASS' ? 0 : nextDecision === 'FAIL' ? defaultSample : 0)
    setReleaseQty(Number(balance?.stockQty || inspection.inspectedQty))
    setHoldQty(0)
    setNote(nextDecision === 'PASS' ? '抽检合格，整批放行' : '')
  }

  const submit = async () => {
    if (!decision || !inspection) return
    setSaving(true)
    try {
      const payload = await decideQualityInspection(inspection.id, {
        decision, sampleQty: Number(sampleQty), goodQty: Number(goodQty), badQty: Number(badQty),
        releaseQty: decision === 'PARTIAL' ? Number(releaseQty) : undefined,
        holdQty: decision === 'PARTIAL' ? Number(holdQty) : undefined,
        note,
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

  const openDisposition = (action: DispositionAction) => {
    const source = action === 'REWORK_COMPLETE' ? reworkBalance : holdBalance
    setDispositionAction(action)
    setDispositionQty(Number(source?.stockQty || 0))
    setDispositionReason('')
  }

  const submitDisposition = async () => {
    if (!dispositionAction || !inspection) return
    setSaving(true)
    try {
      const payload = await disposeQualityInspection(inspection.id, {
        operationId: crypto.randomUUID(),
        action: dispositionAction,
        stockQty: Number(dispositionQty),
        reason: dispositionReason,
      })
      onMessage(payload.message || '质量处置已完成')
      setDispositionAction(null)
      await onChanged()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存质量处置失败')
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
            <AppButton size="sm" variant="secondary" onClick={() => openDecision('PARTIAL')} disabled={saving}>部分判定</AppButton>
          </>)}
          {canDispose && inspection?.status === 'COMPLETED' && holdBalance && (<>
            <AppButton size="sm" variant="secondary" onClick={() => openDisposition('REINSPECT')}>申请复检</AppButton>
            <AppButton size="sm" variant="secondary" onClick={() => openDisposition('REWORK_START')}>转返工</AppButton>
            <AppButton size="sm" variant="danger" onClick={() => openDisposition('SCRAP')}>报废</AppButton>
          </>)}
          {canDispose && inspection?.status === 'COMPLETED' && reworkBalance && <AppButton size="sm" variant="primary" onClick={() => openDisposition('REWORK_COMPLETE')}>返工完成送检</AppButton>}
          {canRelease && inspection?.status === 'COMPLETED' && holdBalance && (<>
            <AppButton size="sm" variant="secondary" onClick={() => openDisposition('CONCESSION')}>让步放行</AppButton>
            <AppButton size="sm" variant="secondary" onClick={() => openDisposition('UNFREEZE')}>解冻放行</AppButton>
          </>)}
        </div>
      </div>
      <div className="mt-1">{positiveBalances.map((item) => `${statusMeta[item.inventoryStatus as keyof typeof statusMeta]?.label || item.inventoryStatus} ${numberText(item.stockQty)}`).join(' · ') || '无在库余额'} · 检验单 {inspection?.inspectionNo || '-'}{inspection?.round ? ` · 第 ${inspection.round} 轮` : ''}</div>
      {inspection?.status === 'COMPLETED' && (
        <div className="mt-1 text-gray-500">
          判定 {inspection.result === 'PASS' ? '合格' : inspection.result === 'FAIL' ? '不合格' : '部分放行'} · 抽检 {numberText(inspection.sampleQty)} · 合格 {numberText(inspection.goodQty)} · 不合格 {numberText(inspection.badQty)} · {inspection.inspector || '未知检验员'}
        </div>
      )}
      {(inspection?.dispositions?.length || 0) > 0 && (
        <details className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
          <summary className="cursor-pointer font-medium text-slate-700">判定与处置记录 · {inspection.dispositions!.length} 条</summary>
          <div className="mt-2 space-y-1.5">
            {inspection.dispositions!.map((item) => (
              <div key={item.id} className="rounded bg-white px-2 py-1.5 text-slate-600">
                <div className="flex flex-wrap justify-between gap-2"><span className="font-medium text-slate-800">{dispositionActionLabels[item.action] || item.action} · {numberText(item.stockQty)}</span><span>{item.performedBy}</span></div>
                <div className="mt-0.5">{item.reason}</div>
                <div className="mt-0.5 font-mono text-[11px] text-slate-400">{item.dispositionNo}</div>
              </div>
            ))}
          </div>
        </details>
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
          title={decision === 'PASS' ? '合格放行批次' : decision === 'FAIL' ? '不合格冻结批次' : '部分放行与冻结'}
          description={`${inspection.inspectionNo} · ${lot.lotNo} · 记录抽检结果并处置本轮全部待检数量`}
          onClose={() => !saving && setDecision(null)}
          closeDisabled={saving}
          size="sm"
          footer={<ModalActions onCancel={() => setDecision(null)} onConfirm={submit} confirmLabel={decision === 'PASS' ? '确认整批放行' : decision === 'FAIL' ? '确认整批冻结' : '确认部分判定'} confirmVariant={decision === 'FAIL' ? 'danger' : 'create'} busy={saving} />}
        >
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-xs font-medium text-gray-700">抽检数量<input type="number" min="0.000001" max={inspection.inspectedQty} step="0.000001" value={sampleQty} onChange={(event) => setSampleQty(Number(event.target.value))} className={`${appInputClassName} mt-1`} /></label>
            <label className="block text-xs font-medium text-gray-700">合格数量<input type="number" min="0" step="0.000001" value={goodQty} onChange={(event) => setGoodQty(Number(event.target.value))} className={`${appInputClassName} mt-1`} /></label>
            <label className="block text-xs font-medium text-gray-700">不合格数量<input type="number" min="0" step="0.000001" value={badQty} onChange={(event) => setBadQty(Number(event.target.value))} className={`${appInputClassName} mt-1`} /></label>
          </div>
          <p className="mt-3 text-xs text-gray-500">合格数量与不合格数量之和必须等于抽检数量；整批合格时不合格样本必须为 0。</p>
          {decision === 'PARTIAL' && <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-gray-700">放行数量<input type="number" min="0.000001" step="0.000001" value={releaseQty} onChange={(event) => setReleaseQty(Number(event.target.value))} className={`${appInputClassName} mt-1`} /></label>
            <label className="block text-xs font-medium text-gray-700">冻结数量<input type="number" min="0.000001" step="0.000001" value={holdQty} onChange={(event) => setHoldQty(Number(event.target.value))} className={`${appInputClassName} mt-1`} /></label>
          </div>}
          <label className="mt-4 block text-sm font-medium text-gray-700">检验结论说明<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className={`${appTextareaClassName} mt-2`} placeholder={decision === 'PASS' ? '例如：关键尺寸抽检符合图纸要求' : '请记录不合格现象和冻结原因'} /></label>
        </ModalDialog>
      )}
      {dispositionAction && inspection && (
        <ModalDialog
          title={dispositionMeta[dispositionAction].label}
          description={`${inspection.inspectionNo} · ${lot.lotNo} · 本次操作将生成独立质量处置记录`}
          onClose={() => !saving && setDispositionAction(null)}
          closeDisabled={saving}
          size="sm"
          footer={<ModalActions onCancel={() => setDispositionAction(null)} onConfirm={submitDisposition} confirmLabel={dispositionMeta[dispositionAction].confirm} confirmVariant={dispositionAction === 'SCRAP' ? 'danger' : 'create'} busy={saving} />}
        >
          <label className="block text-sm font-medium text-gray-700">处置数量<input type="number" min="0.000001" step="0.000001" value={dispositionQty} onChange={(event) => setDispositionQty(Number(event.target.value))} className={`${appInputClassName} mt-2`} /></label>
          <label className="mt-4 block text-sm font-medium text-gray-700">处置原因或审批依据<textarea value={dispositionReason} onChange={(event) => setDispositionReason(event.target.value)} rows={3} className={`${appTextareaClassName} mt-2`} placeholder="例如：返工单号、偏差许可号、报废审批号或解冻依据" /></label>
        </ModalDialog>
      )}
      {traceOpen && <InventoryLotTraceDialog lotId={lot.id} onClose={() => setTraceOpen(false)} onMessage={onMessage} />}
    </div>
  )
}
