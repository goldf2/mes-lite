'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import TopBarPortal from '@/app/components/TopBarPortal'
import { ResourceAdvancedSearch } from '@/app/components/resource'
import { resourceAdvancedFields, type ResourceSearchCondition } from '@/lib/resource-search'
import { AttachmentPanel } from '@/modules/attachments'
import { changeEquipmentInspectionPlan, loadEquipmentInspections } from '../client/equipment-inspection-api'
import type { EquipmentInspectionPlan, EquipmentInspectionWorkspace } from '../contracts/equipment-inspection'
import { buildEquipmentInspectionSearchCatalog } from '../model/equipment-operations-search-fields'
import EquipmentInspectionCompleteDialog from './EquipmentInspectionCompleteDialog'
import EquipmentInspectionPlanDialog from './EquipmentInspectionPlanDialog'

const emptyWorkspace: EquipmentInspectionWorkspace = { plans: [], counts: { due: 0, overdue: 0, abnormal: 0 }, equipmentOptions: [] }
type InspectionFilter = 'DUE' | 'ALL' | 'ABNORMAL'

function dueTone(plan: EquipmentInspectionPlan) {
  if (plan.status !== 'ACTIVE') return 'border-gray-200 bg-gray-50 text-gray-600'
  return new Date(plan.nextDueAt).getTime() <= Date.now() ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

export default function EquipmentInspectionPageModule({ canCreate, canUpdate, canManageAttachments, onMessage }: {
  canCreate: boolean
  canUpdate: boolean
  canManageAttachments: boolean
  onMessage: (message: string) => void
}) {
  const [workspace, setWorkspace] = useState(emptyWorkspace)
  const [filter, setFilter] = useState<InspectionFilter>('DUE')
  const [keyword, setKeyword] = useState('')
  const [searchConditions, setSearchConditions] = useState<ResourceSearchCondition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [planOpen, setPlanOpen] = useState(false)
  const [completingPlan, setCompletingPlan] = useState<EquipmentInspectionPlan | null>(null)
  const [changingId, setChangingId] = useState<string | null>(null)
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setWorkspace(await loadEquipmentInspections(filter, keyword, searchConditions)) }
    catch (requestError) { const message = requestError instanceof Error ? requestError.message : '获取设备点检失败'; setError(message); onMessage(message) }
    finally { setLoading(false) }
  }, [filter, keyword, onMessage, searchConditions])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 180); return () => window.clearTimeout(timer) }, [load])

  const changeStatus = async (plan: EquipmentInspectionPlan) => {
    const action = plan.status === 'ACTIVE' ? 'PAUSE' : 'RESUME'
    if (!confirm(`确定${action === 'PAUSE' ? '暂停' : '恢复'}点检计划 ${plan.code} 吗？`)) return
    setChangingId(plan.id)
    try { await changeEquipmentInspectionPlan(plan.id, action); onMessage(`点检计划已${action === 'PAUSE' ? '暂停' : '恢复'}`); await load() }
    catch (requestError) { onMessage(requestError instanceof Error ? requestError.message : '更新点检计划失败') }
    finally { setChangingId(null) }
  }

  const searchCatalog = useMemo(() => buildEquipmentInspectionSearchCatalog(workspace.equipmentOptions), [workspace.equipmentOptions])
  const advancedSearchFields = useMemo(() => resourceAdvancedFields(searchCatalog), [searchCatalog])

  return (
    <>
      <TopBarPortal><ResponsiveToolbarActions primaryFilters={<SearchFieldWithPresets storageKey="mes-lite.searchPresets.equipmentInspections" value={keyword} onChange={setKeyword} placeholder="搜索计划、设备、检查项、记录或人员" conditions={searchConditions} onConditionsChange={setSearchConditions} />} advancedSearch={<ResourceAdvancedSearch fields={advancedSearchFields} conditions={searchConditions} onChange={setSearchConditions} />} actions={canCreate ? <AppButton variant="create" size="sm" onClick={() => setPlanOpen(true)}>新建点检计划</AppButton> : undefined} /></TopBarPortal>
      <section className="rounded-lg bg-white p-3 shadow sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-semibold text-gray-900">设备点检任务</h2><p className="mt-1 text-sm text-gray-500">按到期任务逐项记录标准、实测、结果与人员；异常自动进入设备故障时间线。</p></div><div className="flex gap-2 text-xs"><span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">到期 {workspace.counts.due}</span><span className="rounded-full bg-red-100 px-3 py-1 text-red-700">逾期 {workspace.counts.overdue}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">异常记录 {workspace.counts.abnormal}</span></div></div>
        <div className="mt-4 flex flex-wrap gap-2">{([['DUE', `到期任务 ${workspace.counts.due}`], ['ABNORMAL', `异常记录 ${workspace.counts.abnormal}`], ['ALL', '全部计划']] as Array<[InspectionFilter, string]>).map(([key, label]) => <AppButton key={key} size="sm" variant={filter === key ? 'primary' : 'secondary'} onClick={() => setFilter(key)}>{label}</AppButton>)}</div>
        <div className="mt-5">{error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : loading && workspace.plans.length === 0 ? <AppLoadingIndicator label="正在读取设备点检任务..." /> : workspace.plans.length === 0 ? <div className="rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-500">当前筛选条件下没有设备点检任务。</div> : <div className="space-y-4">{workspace.plans.map((plan) => <article key={plan.id} className="rounded-xl border border-gray-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-900">{plan.code} · {plan.name}</h3><span className={`rounded-full border px-2 py-0.5 text-xs ${dueTone(plan)}`}>{plan.status === 'PAUSED' ? '已暂停' : new Date(plan.nextDueAt).getTime() <= Date.now() ? '待执行' : '未到期'}</span></div><div className="mt-1 text-sm text-gray-600">{plan.equipment.code} · {plan.equipment.name} · {plan.equipment.workCenter.name}</div><div className="mt-2 text-xs text-gray-500">每 {plan.intervalDays} 天 · 下次到期 {new Date(plan.nextDueAt).toLocaleString('zh-CN')}</div></div><div className="flex flex-wrap gap-2">{canUpdate && plan.status === 'ACTIVE' && new Date(plan.nextDueAt).getTime() <= Date.now() && <AppButton size="sm" variant="primary" onClick={() => setCompletingPlan(plan)}>执行点检</AppButton>}{canUpdate && <AppButton size="sm" variant="secondary" disabled={changingId === plan.id} onClick={() => changeStatus(plan)}>{plan.status === 'ACTIVE' ? '暂停计划' : '恢复计划'}</AppButton>}</div></div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2"><section className="rounded-lg border border-gray-200 bg-white p-3"><h4 className="text-sm font-semibold text-gray-900">检查清单</h4><ol className="mt-2 divide-y divide-gray-100">{plan.items.map((item, index) => <li key={item.id} className="grid grid-cols-[2rem_1fr] gap-2 py-2 text-sm"><span className="text-gray-400">{index + 1}</span><div><div className="font-medium text-gray-800">{item.name}</div><div className="text-gray-500">{item.standard}{item.unit ? ` · ${item.unit}` : ''}</div></div></li>)}</ol></section><section className="rounded-lg border border-gray-200 bg-white p-3"><h4 className="text-sm font-semibold text-gray-900">最近记录</h4>{plan.records.length === 0 ? <div className="py-8 text-center text-sm text-gray-400">尚无点检记录。</div> : <ol className="mt-2 space-y-2">{plan.records.map((record) => <li key={record.id} className="rounded-lg border border-gray-100 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className={record.result === 'ABNORMAL' ? 'font-medium text-red-700' : 'font-medium text-emerald-700'}>{record.recordNo} · {record.result === 'ABNORMAL' ? '异常' : '正常'}</span><time className="text-xs text-gray-500">{new Date(record.inspectedAt).toLocaleString('zh-CN')}</time></div><div className="mt-1 text-gray-600">点检人：{record.inspectorName}{record.note ? ` · ${record.note}` : ''}</div><div className="mt-3 border-t border-gray-100 pt-3"><AttachmentPanel ownerType="EQUIPMENT_INSPECTION_RECORD" ownerId={record.id} title="现场附件" compact readOnly={!canManageAttachments} onMessage={onMessage} /></div></li>)}</ol>}</section></div>
        </article>)}</div>}</div>
      </section>
      {planOpen && <EquipmentInspectionPlanDialog equipmentOptions={workspace.equipmentOptions} onClose={() => setPlanOpen(false)} onSaved={load} onMessage={onMessage} />}
      {completingPlan && <EquipmentInspectionCompleteDialog plan={completingPlan} onClose={() => setCompletingPlan(null)} onSaved={load} onMessage={onMessage} />}
    </>
  )
}
