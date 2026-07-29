'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, PackageCheck, Play, Plus, RotateCcw, Scissors } from 'lucide-react'
import TopBarPortal from './TopBarPortal'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'

interface PlanCut {
  planDemand: {
    demandId: string
    demand: {
      id: string
      demandNo: string
      outputCodeSnapshot: string
      outputNameSnapshot: string
    }
  }
  pieceLengthMm: number
  plannedQty: number
}

interface PlanSource {
  id: string
  sourceUnitIndex: number
  sourceLengthMm: number
  kerfLossMm: number
  fixedLossMm: number
  expectedRemnantLengthMm: number
  entity: {
    id: string
    entityNo: string
    actualLengthMm: number
    location?: string | null
    batchNo?: string | null
  }
  cuts: PlanCut[]
}

interface CuttingPlan {
  id: string
  planNo: string
  status: string
  totalSourceQty: number
  totalPlannedQty: number
  utilizationRate: number
  sources: PlanSource[]
}

interface CuttingTask {
  id: string
  taskNo: string
  status: string
  device?: string | null
  shift?: string | null
  note?: string | null
  startedAt?: string | null
  completedAt?: string | null
  completedBy?: string | null
  reversedAt?: string | null
  reverseReason?: string | null
  issueStockQty: number
  issueCostAmount: number
  remnantStockQty: number
  remnantCostAmount: number
  rawMaterial: {
    code: string
    name: string
    spec?: string | null
    stockUnit: string
  }
  cuttingPlan: CuttingPlan
  sources: Array<{
    id: string
    disposition: string
    actualRemainingLengthMm: number
    remnantEntity?: {
      id: string
      entityNo: string
      actualLengthMm: number
      status: string
      location?: string | null
    } | null
    outputs: Array<{
      id: string
      goodQty: number
      badQty: number
      scrapQty: number
    }>
  }>
}

type OutputDraft = {
  cuttingDemandId: string
  demandNo: string
  outputName: string
  plannedQty: number
  goodQty: number
  badQty: number
  scrapQty: number
  badReason: string
}

type SourceDraft = {
  planSourceId: string
  entityNo: string
  sourceUnitIndex: number
  actualSourceLengthMm: number
  actualRemainingLengthMm: number
  actualKerfLossMm: number
  actualFixedLossMm: number
  actualOtherLossMm: number
  disposition: 'REUSABLE_REMNANT' | 'SCRAP'
  outputs: OutputDraft[]
}

const statusLabels: Record<string, string> = {
  READY: '待开工',
  RUNNING: '加工中',
  COMPLETED: '已完工',
  REVERSED: '已冲销',
}

const statusClasses: Record<string, string> = {
  READY: 'bg-blue-50 text-blue-700',
  RUNNING: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  REVERSED: 'bg-gray-100 text-gray-600',
}

function numberText(value: number, digits = 2) {
  return Number(value || 0).toFixed(digits).replace(/\.?0+$/, '')
}

function makeCompletionDraft(task: CuttingTask): SourceDraft[] {
  return task.cuttingPlan.sources.map((source) => {
    const outputByDemand = new Map<string, OutputDraft>()
    for (const cut of source.cuts) {
      const demand = cut.planDemand.demand
      const existing = outputByDemand.get(cut.planDemand.demandId)
      if (existing) {
        existing.plannedQty += cut.plannedQty
        existing.goodQty += cut.plannedQty
      } else {
        outputByDemand.set(cut.planDemand.demandId, {
          cuttingDemandId: cut.planDemand.demandId,
          demandNo: demand.demandNo,
          outputName: `${demand.outputCodeSnapshot} · ${demand.outputNameSnapshot}`,
          plannedQty: cut.plannedQty,
          goodQty: cut.plannedQty,
          badQty: 0,
          scrapQty: 0,
          badReason: '',
        })
      }
    }
    return {
      planSourceId: source.id,
      entityNo: source.entity.entityNo,
      sourceUnitIndex: source.sourceUnitIndex,
      actualSourceLengthMm: source.sourceLengthMm,
      actualRemainingLengthMm: source.expectedRemnantLengthMm,
      actualKerfLossMm: source.kerfLossMm,
      actualFixedLossMm: source.fixedLossMm,
      actualOtherLossMm: 0,
      disposition: source.expectedRemnantLengthMm > 0 ? 'REUSABLE_REMNANT' : 'SCRAP',
      outputs: Array.from(outputByDemand.values()),
    }
  })
}

export default function CuttingExecutionPage({
  onMessage,
  canCreate,
  canUpdate,
}: {
  onMessage: (message: string) => void
  canCreate: boolean
  canUpdate: boolean
}) {
  const [tasks, setTasks] = useState<CuttingTask[]>([])
  const [plans, setPlans] = useState<CuttingPlan[]>([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [showRelease, setShowRelease] = useState(false)
  const [releaseForm, setReleaseForm] = useState({ cuttingPlanId: '', device: '', shift: '', note: '' })
  const [completionTask, setCompletionTask] = useState<CuttingTask | null>(null)
  const [completionDraft, setCompletionDraft] = useState<SourceDraft[]>([])

  const fetchTasks = useCallback(async () => {
    const params = new URLSearchParams({ pageSize: '100' })
    if (status) params.set('status', status)
    const response = await fetch(`/api/cutting-tasks?${params.toString()}`)
    const payload = await response.json()
    if (!response.ok) return onMessage(payload.error || '获取锯切任务失败')
    setTasks(payload.data || [])
  }, [onMessage, status])

  const fetchPlans = useCallback(async () => {
    const response = await fetch('/api/cutting-plans?status=CONFIRMED&pageSize=100')
    const payload = await response.json()
    if (response.ok) {
      setPlans(payload.data || [])
      setReleaseForm((current) => ({
        ...current,
        cuttingPlanId: current.cuttingPlanId || payload.data?.[0]?.id || '',
      }))
    }
  }, [])

  useEffect(() => {
    fetchTasks()
    fetchPlans()
  }, [fetchPlans, fetchTasks])

  const summary = useMemo(() => ({
    ready: tasks.filter((item) => item.status === 'READY').length,
    running: tasks.filter((item) => item.status === 'RUNNING').length,
    completed: tasks.filter((item) => item.status === 'COMPLETED').length,
    remnantQty: tasks
      .filter((item) => item.status === 'COMPLETED')
      .reduce((sum, item) => sum + Number(item.remnantStockQty || 0), 0),
  }), [tasks])

  const refresh = async () => Promise.all([fetchTasks(), fetchPlans()])

  const releaseTask = async () => {
    if (!releaseForm.cuttingPlanId) return onMessage('请选择已确认的排样方案')
    setLoading(true)
    try {
      const response = await fetch('/api/cutting-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...releaseForm,
          clientRequestId: window.crypto.randomUUID(),
        }),
      })
      const payload = await response.json()
      onMessage(response.ok ? payload.message : payload.error || '下发锯切任务失败')
      if (response.ok) {
        setShowRelease(false)
        setReleaseForm({ cuttingPlanId: '', device: '', shift: '', note: '' })
        await refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  const startTask = async (task: CuttingTask) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/cutting-tasks/${task.id}/start`, { method: 'PATCH' })
      const payload = await response.json()
      onMessage(response.ok ? payload.message : payload.error || '开工失败')
      if (response.ok) await fetchTasks()
    } finally {
      setLoading(false)
    }
  }

  const openCompletion = (task: CuttingTask) => {
    setCompletionTask(task)
    setCompletionDraft(makeCompletionDraft(task))
  }

  const updateSource = (sourceIndex: number, field: keyof SourceDraft, value: number | string) => {
    setCompletionDraft((current) => current.map((source, index) => (
      index === sourceIndex ? { ...source, [field]: value } : source
    )))
  }

  const updateOutput = (sourceIndex: number, outputIndex: number, field: keyof OutputDraft, value: number | string) => {
    setCompletionDraft((current) => current.map((source, index) => (
      index !== sourceIndex
        ? source
        : {
          ...source,
          outputs: source.outputs.map((output, childIndex) => (
            childIndex === outputIndex ? { ...output, [field]: value } : output
          )),
        }
    )))
  }

  const completeTask = async () => {
    if (!completionTask) return
    setLoading(true)
    try {
      const response = await fetch(`/api/cutting-tasks/${completionTask.id}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientRequestId: window.crypto.randomUUID(),
          sources: completionDraft.map((source) => ({
            planSourceId: source.planSourceId,
            actualSourceLengthMm: Number(source.actualSourceLengthMm),
            actualRemainingLengthMm: Number(source.actualRemainingLengthMm),
            actualKerfLossMm: Number(source.actualKerfLossMm),
            actualFixedLossMm: Number(source.actualFixedLossMm),
            actualOtherLossMm: Number(source.actualOtherLossMm),
            disposition: source.disposition,
            outputs: source.outputs.map((output) => ({
              cuttingDemandId: output.cuttingDemandId,
              goodQty: Number(output.goodQty),
              badQty: Number(output.badQty),
              scrapQty: Number(output.scrapQty),
              badReason: output.badReason || null,
            })),
          })),
        }),
      })
      const payload = await response.json()
      onMessage(response.ok ? payload.message : payload.error || '提交锯切实绩失败')
      if (response.ok) {
        setCompletionTask(null)
        setCompletionDraft([])
        await refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  const reverseTask = async (task: CuttingTask) => {
    const reason = window.prompt(`请输入冲销锯切任务 ${task.taskNo} 的原因`)
    if (!reason || reason.trim().length < 2) return
    setLoading(true)
    try {
      const response = await fetch(`/api/cutting-tasks/${task.id}/reverse`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const payload = await response.json()
      onMessage(response.ok ? payload.message : payload.error || '冲销锯切任务失败')
      if (response.ok) await refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          filters={(
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <option value="">全部状态</option>
              <option value="READY">待开工</option>
              <option value="RUNNING">加工中</option>
              <option value="COMPLETED">已完工</option>
              <option value="REVERSED">已冲销</option>
            </select>
          )}
          actions={canCreate ? (
            <button onClick={() => setShowRelease((value) => !value)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              <Plus className="h-4 w-4" />下发锯切任务
            </button>
          ) : null}
        />
      </TopBarPortal>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['待开工', summary.ready, 'border-blue-100 bg-blue-50 text-blue-900'],
            ['加工中', summary.running, 'border-amber-100 bg-amber-50 text-amber-900'],
            ['已完工', summary.completed, 'border-emerald-100 bg-emerald-50 text-emerald-900'],
            ['可复用余料', summary.remnantQty, 'border-violet-100 bg-violet-50 text-violet-900'],
          ].map(([label, value, className]) => (
            <div key={String(label)} className={`rounded-lg border p-4 ${className}`}>
              <div className="text-sm opacity-75">{label}</div>
              <div className="mt-2 text-2xl font-semibold">{value}</div>
            </div>
          ))}
        </div>

        {showRelease && (
          <section className="rounded-lg border border-blue-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-gray-900">从已确认排样下发任务</h2>
                <p className="mt-1 text-sm text-gray-500">下发不会再次扣库存；完工时才把排样占用转为实际耗用。</p>
              </div>
              <button onClick={() => setShowRelease(false)} className="text-sm text-gray-500 hover:text-gray-900">关闭</button>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-4">
              <label className="text-sm text-gray-600 lg:col-span-2">
                排样方案
                <select value={releaseForm.cuttingPlanId} onChange={(event) => setReleaseForm({ ...releaseForm, cuttingPlanId: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-gray-900">
                  <option value="">请选择</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>{plan.planNo} · {plan.totalSourceQty} 根 / {plan.totalPlannedQty} 件</option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-gray-600">
                设备
                <input value={releaseForm.device} onChange={(event) => setReleaseForm({ ...releaseForm, device: event.target.value })} placeholder="例如：锯床 1" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-gray-900" />
              </label>
              <label className="text-sm text-gray-600">
                班次
                <input value={releaseForm.shift} onChange={(event) => setReleaseForm({ ...releaseForm, shift: event.target.value })} placeholder="例如：白班" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-gray-900" />
              </label>
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input value={releaseForm.note} onChange={(event) => setReleaseForm({ ...releaseForm, note: event.target.value })} placeholder="任务备注（可选）" className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              <button disabled={loading || !releaseForm.cuttingPlanId} onClick={releaseTask} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">确认下发</button>
            </div>
            {plans.length === 0 && <p className="mt-3 text-sm text-amber-700">暂无可下发方案，请先在“切割排样”确认方案。</p>}
          </section>
        )}

        <section className="space-y-3">
          {tasks.map((task) => (
            <article key={task.id} className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Scissors className="h-5 w-5 text-blue-600" />
                    <span className="font-mono font-semibold text-blue-700">{task.taskNo}</span>
                    <span className={`rounded px-2 py-0.5 text-xs ${statusClasses[task.status] || 'bg-gray-100 text-gray-600'}`}>{statusLabels[task.status] || task.status}</span>
                  </div>
                  <h2 className="mt-2 font-semibold text-gray-900">{task.rawMaterial.code} · {task.rawMaterial.name}</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    排样 {task.cuttingPlan.planNo} · {task.cuttingPlan.totalSourceQty} 根 · {task.cuttingPlan.totalPlannedQty} 件 · 利用率 {numberText(task.cuttingPlan.utilizationRate)}%
                  </p>
                  {(task.device || task.shift) && <p className="mt-1 text-sm text-gray-500">{task.device || '未指定设备'} · {task.shift || '未指定班次'}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canUpdate && task.status === 'READY' && (
                    <button disabled={loading} onClick={() => startTask(task)} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50">
                      <Play className="h-4 w-4" />开工
                    </button>
                  )}
                  {canUpdate && ['READY', 'RUNNING'].includes(task.status) && (
                    <button disabled={loading} onClick={() => openCompletion(task)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />完工报数
                    </button>
                  )}
                  {canUpdate && task.status === 'COMPLETED' && (
                    <button disabled={loading} onClick={() => reverseTask(task)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50">
                      <RotateCcw className="h-4 w-4" />冲销
                    </button>
                  )}
                </div>
              </div>
              {task.status === 'COMPLETED' && (
                <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-3">
                  <div className="rounded-lg bg-gray-50 p-3 text-sm"><span className="text-gray-500">耗用原料</span><div className="mt-1 font-semibold">{numberText(task.issueStockQty)} {task.rawMaterial.stockUnit}</div></div>
                  <div className="rounded-lg bg-emerald-50 p-3 text-sm"><span className="text-emerald-700">余料回库</span><div className="mt-1 font-semibold text-emerald-900">{numberText(task.remnantStockQty)} 根</div></div>
                  <div className="rounded-lg bg-gray-50 p-3 text-sm"><span className="text-gray-500">净耗用成本</span><div className="mt-1 font-semibold">¥ {numberText(task.issueCostAmount - task.remnantCostAmount, 4)}</div></div>
                </div>
              )}
              {task.sources.some((source) => source.remnantEntity) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {task.sources.filter((source) => source.remnantEntity).map((source) => (
                    <span key={source.id} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-3 py-1 text-xs text-violet-700">
                      <PackageCheck className="h-3.5 w-3.5" />
                      {source.remnantEntity?.entityNo} · {numberText(source.remnantEntity?.actualLengthMm || 0)} mm
                    </span>
                  ))}
                </div>
              )}
              {task.status === 'REVERSED' && task.reverseReason && <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">冲销原因：{task.reverseReason}</p>}
            </article>
          ))}
          {tasks.length === 0 && <div className="rounded-lg border border-dashed border-gray-200 bg-white py-16 text-center text-sm text-gray-500">暂无锯切任务。</div>}
        </section>

        {completionTask && (
          <section className="rounded-lg border border-emerald-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-gray-900">锯切完工 · {completionTask.taskNo}</h2>
                <p className="mt-1 text-sm text-gray-500">逐根核对产出、损耗和剩余长度；每根长度差必须在 1 mm 内闭合。</p>
              </div>
              <button onClick={() => setCompletionTask(null)} className="text-sm text-gray-500 hover:text-gray-900">关闭</button>
            </div>
            <div className="mt-4 space-y-4">
              {completionDraft.map((source, sourceIndex) => (
                <div key={source.planSourceId} className="rounded-lg border border-gray-200 p-4">
                  <div className="font-medium text-gray-900">{source.entityNo} · 第 {source.sourceUnitIndex} 根</div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                    {[
                      ['actualSourceLengthMm', '原料长度 mm'],
                      ['actualRemainingLengthMm', '剩余长度 mm'],
                      ['actualKerfLossMm', '锯缝损耗 mm'],
                      ['actualFixedLossMm', '首尾/夹持 mm'],
                      ['actualOtherLossMm', '其他损耗 mm'],
                    ].map(([field, label]) => (
                      <label key={field} className="text-xs text-gray-500">
                        {label}
                        <input type="number" min={0} step="0.1" value={Number(source[field as keyof SourceDraft])} onChange={(event) => updateSource(sourceIndex, field as keyof SourceDraft, Number(event.target.value))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-right text-sm text-gray-900" />
                      </label>
                    ))}
                    <label className="text-xs text-gray-500">
                      剩余去向
                      <select value={source.disposition} onChange={(event) => updateSource(sourceIndex, 'disposition', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900">
                        <option value="REUSABLE_REMNANT">余料回库</option>
                        <option value="SCRAP">废料</option>
                      </select>
                    </label>
                  </div>
                  <div className="mt-4 space-y-2">
                    {source.outputs.map((output, outputIndex) => (
                      <div key={output.cuttingDemandId} className="grid items-end gap-2 rounded-lg bg-gray-50 p-3 md:grid-cols-[minmax(180px,1fr)_repeat(3,90px)_minmax(140px,1fr)]">
                        <div className="text-sm">
                          <div className="font-medium text-gray-900">{output.outputName}</div>
                          <div className="text-xs text-gray-500">{output.demandNo} · 计划 {output.plannedQty}</div>
                        </div>
                        {[
                          ['goodQty', '合格'],
                          ['badQty', '不良'],
                          ['scrapQty', '报废'],
                        ].map(([field, label]) => (
                          <label key={field} className="text-xs text-gray-500">
                            {label}
                            <input type="number" min={0} step={1} value={Number(output[field as keyof OutputDraft])} onChange={(event) => updateOutput(sourceIndex, outputIndex, field as keyof OutputDraft, Number(event.target.value))} className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2 text-right text-sm text-gray-900" />
                          </label>
                        ))}
                        <label className="text-xs text-gray-500">
                          不良说明
                          <input value={output.badReason} onChange={(event) => updateOutput(sourceIndex, outputIndex, 'badReason', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900" />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setCompletionTask(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700">取消</button>
              <button disabled={loading} onClick={completeTask} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">确认完工并过账</button>
            </div>
          </section>
        )}
      </div>
    </>
  )
}
