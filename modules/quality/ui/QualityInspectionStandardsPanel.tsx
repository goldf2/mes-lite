'use client'

import { useCallback, useEffect, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import { appTextareaClassName } from '@/app/components/FormField'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import {
  copyQualityInspectionStandard,
  loadQualityInspectionStandards,
  obsoleteQualityInspectionStandard,
  releaseQualityInspectionStandard,
} from '../client/quality-inspection-standard-api'
import type { QualityInspectionStandardView, QualityInspectionStandardWorkspace } from '../contracts/quality-inspection-standard'
import QualityInspectionStandardDialog from './QualityInspectionStandardDialog'

const emptyWorkspace: QualityInspectionStandardWorkspace = { standards: [], materials: [] }
const statusLabel = { DRAFT: '草稿', RELEASED: '已发布', OBSOLETE: '已停用' } as const
const statusClass = { DRAFT: 'bg-amber-100 text-amber-800', RELEASED: 'bg-emerald-100 text-emerald-800', OBSOLETE: 'bg-gray-100 text-gray-600' } as const
const sourceLabel: Record<string, string> = { PRODUCTION_ORDER_ACTUAL_OUTPUT: '生产入库', MATERIAL_IN: '来料入库', RETURN_ORDER: '退货入库' }

function samplingText(standard: QualityInspectionStandardView) {
  const core = standard.samplingMode === 'FULL' ? '全检' : standard.samplingMode === 'FIXED' ? `固定 ${standard.sampleValue}` : `${standard.sampleValue}%`
  const range = [standard.minSampleQty == null ? '' : `最低 ${standard.minSampleQty}`, standard.maxSampleQty == null ? '' : `最高 ${standard.maxSampleQty}`].filter(Boolean).join(' / ')
  return range ? `${core} · ${range}` : core
}

export default function QualityInspectionStandardsPanel({ canCreate, canUpdate, onMessage }: {
  canCreate: boolean
  canUpdate: boolean
  onMessage: (message: string) => void
}) {
  const [workspace, setWorkspace] = useState(emptyWorkspace)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<QualityInspectionStandardView | null | undefined>(undefined)
  const [reasonAction, setReasonAction] = useState<{ kind: 'COPY' | 'OBSOLETE'; standard: QualityInspectionStandardView } | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setWorkspace(await loadQualityInspectionStandards(keyword, status)) }
    catch (error) { onMessage(error instanceof Error ? error.message : '获取检验标准失败') }
    finally { setLoading(false) }
  }, [keyword, onMessage, status])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180)
    return () => window.clearTimeout(timer)
  }, [load])

  const release = async (standard: QualityInspectionStandardView) => {
    if (!window.confirm(`确认发布 ${standard.code} v${standard.version}？\n发布后内容不可改写，同物料同来源的旧版会自动停用。`)) return
    setSaving(true)
    try { await releaseQualityInspectionStandard(standard.id); onMessage('检验标准已发布'); await load() }
    catch (error) { onMessage(error instanceof Error ? error.message : '发布检验标准失败') }
    finally { setSaving(false) }
  }

  const submitReasonAction = async () => {
    if (!reasonAction || !reason.trim()) return onMessage('请填写原因')
    setSaving(true)
    try {
      if (reasonAction.kind === 'COPY') {
        const copied = await copyQualityInspectionStandard(reasonAction.standard.id, reason)
        onMessage(`已创建 ${copied.code} v${copied.version} 草稿`)
        setReasonAction(null); setReason(''); await load(); setEditing(copied)
      } else {
        await obsoleteQualityInspectionStandard(reasonAction.standard.id, reason)
        onMessage('检验标准已停用')
        setReasonAction(null); setReason(''); await load()
      }
    } catch (error) { onMessage(error instanceof Error ? error.message : '操作检验标准失败') }
    finally { setSaving(false) }
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-gray-900">检验标准与抽样</h2><p className="mt-1 text-sm text-gray-500">草稿可编辑，发布后不可覆盖；修订通过复制新版本完成。</p></div>
        {canCreate && <AppButton variant="create" onClick={() => setEditing(null)}>新建检验标准</AppButton>}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <div className="min-w-[16rem] flex-1"><SearchFieldWithPresets storageKey="mes-lite.searchPresets.qualityStandards" value={keyword} onChange={setKeyword} placeholder="搜索标准、物料编码或名称" /></div>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700"><option value="">全部状态</option><option value="DRAFT">草稿</option><option value="RELEASED">已发布</option><option value="OBSOLETE">已停用</option></select>
      </div>
      <div className="mt-5">
        {loading && workspace.standards.length === 0 ? <AppLoadingIndicator label="正在读取检验标准..." /> : workspace.standards.length === 0 ? <div className="rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-500">当前条件下没有检验标准。</div> : <div className="space-y-3">{workspace.standards.map((standard) => (
          <article key={standard.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-900">{standard.code} v{standard.version} · {standard.name}</h3><span className={`rounded px-2 py-0.5 text-xs font-medium ${statusClass[standard.status]}`}>{statusLabel[standard.status]}</span></div><p className="mt-1 text-sm text-gray-600">{standard.material.code} · {standard.material.name} · {sourceLabel[standard.sourceType]} · {samplingText(standard)}</p></div>
              <div className="flex flex-wrap gap-2">
                {standard.status === 'DRAFT' && canUpdate && <><AppButton size="sm" variant="secondary" onClick={() => setEditing(standard)}>编辑草稿</AppButton><AppButton size="sm" variant="primary" onClick={() => void release(standard)} disabled={saving}>发布</AppButton></>}
                {standard.status !== 'DRAFT' && canCreate && <AppButton size="sm" variant="secondary" onClick={() => { setReasonAction({ kind: 'COPY', standard }); setReason('') }}>复制新版本</AppButton>}
                {standard.status === 'RELEASED' && canUpdate && <AppButton size="sm" variant="danger" onClick={() => { setReasonAction({ kind: 'OBSOLETE', standard }); setReason('') }}>停用</AppButton>}
              </div>
            </div>
            <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2"><summary className="cursor-pointer text-sm font-medium text-slate-700">检验项目 {standard.items.length} 项 · 变更原因：{standard.changeReason}</summary><ol className="mt-2 divide-y divide-slate-200">{standard.items.map((item, index) => <li key={item.id} className="grid gap-2 py-2 text-sm md:grid-cols-[2rem_1fr_1.2fr_1.5fr]"><span className="text-slate-400">{index + 1}</span><span className="font-medium text-slate-800">{item.name}</span><span className="text-slate-600">{item.method}</span><span className="text-slate-600">{item.acceptanceCriteria}</span></li>)}</ol></details>
            <div className="mt-2 text-xs text-gray-400">创建人 {standard.createdBy}{standard.releasedBy ? ` · 发布人 ${standard.releasedBy}` : ''} · 更新 {new Date(standard.updatedAt).toLocaleString('zh-CN')}</div>
          </article>
        ))}</div>}
      </div>
      {editing !== undefined && <QualityInspectionStandardDialog standard={editing || undefined} materials={workspace.materials} onClose={() => setEditing(undefined)} onSaved={load} onMessage={onMessage} />}
      {reasonAction && <ModalDialog title={reasonAction.kind === 'COPY' ? '复制检验标准新版本' : '停用检验标准'} description={`${reasonAction.standard.code} v${reasonAction.standard.version} · ${reasonAction.standard.name}`} onClose={() => !saving && setReasonAction(null)} closeDisabled={saving} size="sm" footer={<ModalActions onCancel={() => setReasonAction(null)} onConfirm={submitReasonAction} confirmLabel={reasonAction.kind === 'COPY' ? '创建新版草稿' : '确认停用'} confirmVariant={reasonAction.kind === 'COPY' ? 'create' : 'danger'} busy={saving} />}><label className="block text-sm font-medium text-gray-700">{reasonAction.kind === 'COPY' ? '版本变更原因' : '停用原因'} *<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} className={`mt-2 ${appTextareaClassName}`} /></label></ModalDialog>}
    </section>
  )
}
