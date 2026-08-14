'use client'

import { useCallback, useEffect, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import TopBarPortal from '@/app/components/TopBarPortal'
import { AttachmentPanel } from '@/modules/attachments'
import {
  cancelEquipmentMaintenanceWorkOrder,
  changeEquipmentMaintenancePlan,
  generatePreventiveMaintenanceWorkOrder,
  loadEquipmentMaintenance,
  startEquipmentMaintenanceWorkOrder,
} from '../client/equipment-maintenance-api'
import type { EquipmentMaintenancePlan, EquipmentMaintenanceWorkOrder, EquipmentMaintenanceWorkspace } from '../contracts/equipment-maintenance'
import EquipmentMaintenanceCompleteDialog from './EquipmentMaintenanceCompleteDialog'
import EquipmentMaintenancePlanDialog from './EquipmentMaintenancePlanDialog'
import EquipmentMaintenanceRepairDialog from './EquipmentMaintenanceRepairDialog'

const emptyWorkspace: EquipmentMaintenanceWorkspace = {
  plans: [], workOrders: [], counts: { duePlans: 0, overduePlans: 0, openOrders: 0, activeOrders: 0, completedOrders: 0 }, equipmentOptions: [], materialOptions: [],
}
type MaintenanceFilter = 'DUE' | 'OPEN' | 'HISTORY' | 'ALL'

const statusLabel: Record<string, string> = { OPEN: '待处理', IN_PROGRESS: '维修中', COMPLETED: '已完成', CANCELLED: '已取消' }
const priorityLabel: Record<string, string> = { LOW: '低', NORMAL: '普通', HIGH: '高', URGENT: '紧急' }
const statusTone: Record<string, string> = {
  OPEN: 'border-amber-200 bg-amber-50 text-amber-800', IN_PROGRESS: 'border-blue-200 bg-blue-50 text-blue-700',
  COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-700', CANCELLED: 'border-gray-200 bg-gray-50 text-gray-500',
}

export default function EquipmentMaintenancePageModule({ canCreate, canUpdate, canManageAttachments, onMessage }: {
  canCreate: boolean
  canUpdate: boolean
  canManageAttachments: boolean
  onMessage: (message: string) => void
}) {
  const [workspace, setWorkspace] = useState(emptyWorkspace)
  const [filter, setFilter] = useState<MaintenanceFilter>('DUE')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [planOpen, setPlanOpen] = useState(false)
  const [repairOpen, setRepairOpen] = useState(false)
  const [completing, setCompleting] = useState<EquipmentMaintenanceWorkOrder | null>(null)
  const [changingId, setChangingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setWorkspace(await loadEquipmentMaintenance(filter, keyword)) }
    catch (requestError) { const message = requestError instanceof Error ? requestError.message : '获取设备维保任务失败'; setError(message); onMessage(message) }
    finally { setLoading(false) }
  }, [filter, keyword, onMessage])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 180); return () => window.clearTimeout(timer) }, [load])

  const generateOrder = async (plan: EquipmentMaintenancePlan) => {
    if (!confirm(`确定为 ${plan.code} 当前应保周期生成保养工单吗？`)) return
    setChangingId(plan.id)
    try { await generatePreventiveMaintenanceWorkOrder(plan.id); onMessage('保养工单已生成'); setFilter('OPEN'); await load() }
    catch (requestError) { onMessage(requestError instanceof Error ? requestError.message : '生成保养工单失败') }
    finally { setChangingId(null) }
  }
  const changePlan = async (plan: EquipmentMaintenancePlan) => {
    const action = plan.status === 'ACTIVE' ? 'PAUSE' : 'RESUME'
    if (!confirm(`确定${action === 'PAUSE' ? '暂停' : '恢复'}保养计划 ${plan.code} 吗？`)) return
    setChangingId(plan.id)
    try { await changeEquipmentMaintenancePlan(plan.id, action); onMessage(`保养计划已${action === 'PAUSE' ? '暂停' : '恢复'}`); await load() }
    catch (requestError) { onMessage(requestError instanceof Error ? requestError.message : '更新保养计划失败') }
    finally { setChangingId(null) }
  }
  const startOrder = async (workOrder: EquipmentMaintenanceWorkOrder) => {
    if (!confirm(`确定开始工单 ${workOrder.workOrderNo} 吗？设备将进入维修状态。`)) return
    setChangingId(workOrder.id)
    try { await startEquipmentMaintenanceWorkOrder(workOrder.id); onMessage('工单已开始，设备已进入维修状态'); await load() }
    catch (requestError) { onMessage(requestError instanceof Error ? requestError.message : '开始维修工单失败') }
    finally { setChangingId(null) }
  }
  const cancelOrder = async (workOrder: EquipmentMaintenanceWorkOrder) => {
    const reason = prompt(`请输入取消工单 ${workOrder.workOrderNo} 的原因`)
    if (!reason?.trim()) return
    setChangingId(workOrder.id)
    try { await cancelEquipmentMaintenanceWorkOrder(workOrder.id, reason); onMessage('工单已取消，未产生库存过账'); await load() }
    catch (requestError) { onMessage(requestError instanceof Error ? requestError.message : '取消维修工单失败') }
    finally { setChangingId(null) }
  }

  const showPlans = filter === 'DUE' || filter === 'ALL'
  return (
    <>
      <TopBarPortal><ResponsiveToolbarActions primaryFilters={<SearchFieldWithPresets storageKey="mes-lite.searchPresets.equipmentMaintenance" value={keyword} onChange={setKeyword} placeholder="搜索计划、工单、设备或负责人" />} actions={canCreate ? <div className="flex gap-2"><AppButton variant="secondary" size="sm" onClick={() => setPlanOpen(true)}>新建保养计划</AppButton><AppButton variant="create" size="sm" onClick={() => setRepairOpen(true)}>新建维修工单</AppButton></div> : undefined} /></TopBarPortal>
      <section className="rounded-lg bg-white p-3 shadow sm:p-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between"><div><h2 className="text-lg font-semibold text-gray-900">设备保养与维修</h2><p className="mt-1 text-sm text-gray-500">从到期计划或故障创建工单，开始时锁定维修状态，完成时原子恢复设备并过账备件批次与成本。</p></div><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">到期保养 {workspace.counts.duePlans}</span><span className="rounded-full bg-red-100 px-3 py-1 text-red-700">逾期 {workspace.counts.overduePlans}</span><span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700">维修中 {workspace.counts.activeOrders}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">待处理 {workspace.counts.openOrders}</span></div></div>
        <div className="mt-4 flex flex-wrap gap-2">{([['DUE', `到期计划 ${workspace.counts.duePlans}`], ['OPEN', `待办工单 ${workspace.counts.openOrders + workspace.counts.activeOrders}`], ['HISTORY', `完成记录 ${workspace.counts.completedOrders}`], ['ALL', '全部计划与工单']] as Array<[MaintenanceFilter, string]>).map(([key, label]) => <AppButton key={key} size="sm" variant={filter === key ? 'primary' : 'secondary'} onClick={() => setFilter(key)}>{label}</AppButton>)}</div>
        {error ? <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : loading && workspace.plans.length === 0 && workspace.workOrders.length === 0 ? <div className="mt-5"><AppLoadingIndicator label="正在读取设备维保任务..." /></div> : <div className="mt-5 space-y-6">
          {showPlans && <section><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-gray-900">{filter === 'DUE' ? '到期保养计划' : '保养计划'}</h3><span className="text-xs text-gray-500">{workspace.plans.length} 项</span></div>{workspace.plans.length === 0 ? <div className="rounded-lg border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-500">当前没有到期保养计划。</div> : <div className="grid gap-4 xl:grid-cols-2">{workspace.plans.map((plan) => {
            const due = plan.status === 'ACTIVE' && new Date(plan.nextDueAt).getTime() <= Date.now()
            const hasCurrentOrder = plan.workOrders.some((order) => order.planDueAt && new Date(order.planDueAt).getTime() === new Date(plan.nextDueAt).getTime())
            return <article key={plan.id} className="rounded-xl border border-gray-200 bg-slate-50 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold text-gray-900">{plan.code} · {plan.name}</h4><span className={`rounded-full border px-2 py-0.5 text-xs ${plan.status === 'PAUSED' ? 'border-gray-200 bg-gray-50 text-gray-500' : due ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{plan.status === 'PAUSED' ? '已暂停' : due ? hasCurrentOrder ? '已生成工单' : '待生成工单' : '未到期'}</span></div><div className="mt-1 text-sm text-gray-600">{plan.equipment.code} · {plan.equipment.name} · {plan.equipment.workCenter.name}</div><div className="mt-2 text-xs text-gray-500">每 {plan.intervalDays} 天 · 下次到期 {new Date(plan.nextDueAt).toLocaleString('zh-CN')}</div></div><div className="flex flex-wrap gap-2">{canUpdate && due && !hasCurrentOrder && <AppButton size="sm" variant="primary" disabled={changingId === plan.id} onClick={() => generateOrder(plan)}>生成保养工单</AppButton>}{canUpdate && <AppButton size="sm" variant="secondary" disabled={changingId === plan.id} onClick={() => changePlan(plan)}>{plan.status === 'ACTIVE' ? '暂停计划' : '恢复计划'}</AppButton>}</div></div><ol className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white px-3">{plan.items.map((item, index) => <li key={item.id} className="grid grid-cols-[2rem_1fr] gap-2 py-2 text-sm"><span className="text-gray-400">{index + 1}</span><div><div className="font-medium text-gray-800">{item.name}</div><div className="text-gray-500">{item.standard}</div></div></li>)}</ol></article>
          })}</div>}</section>}
          <section><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-gray-900">{filter === 'HISTORY' ? '维修保养历史' : '维修保养工单'}</h3><span className="text-xs text-gray-500">{workspace.workOrders.length} 张</span></div>{workspace.workOrders.length === 0 ? <div className="rounded-lg border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-500">当前筛选条件下没有维修保养工单。</div> : <div className="space-y-4">{workspace.workOrders.map((workOrder) => <article key={workOrder.id} className="rounded-xl border border-gray-200 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold text-gray-900">{workOrder.workOrderNo} · {workOrder.title}</h4><span className={`rounded-full border px-2 py-0.5 text-xs ${statusTone[workOrder.status] || statusTone.OPEN}`}>{statusLabel[workOrder.status] || workOrder.status}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{workOrder.kind === 'PREVENTIVE' ? '计划保养' : '故障维修'} · {priorityLabel[workOrder.priority] || workOrder.priority}</span></div><div className="mt-1 text-sm text-gray-600">{workOrder.equipment.code} · {workOrder.equipment.name} · {workOrder.equipment.workCenter.name}{workOrder.assignedTo ? ` · 负责人 ${workOrder.assignedTo}` : ''}</div>{workOrder.faultDescription && <div className="mt-2 text-sm text-red-700">故障现象：{workOrder.faultDescription}</div>}{workOrder.workDescription && <div className="mt-2 text-sm text-gray-700">作业结果：{workOrder.workDescription}</div>}</div><div className="flex flex-wrap gap-2">{canUpdate && workOrder.status === 'OPEN' && <><AppButton size="sm" variant="primary" disabled={changingId === workOrder.id} onClick={() => startOrder(workOrder)}>开始维修</AppButton><AppButton size="sm" variant="secondary" disabled={changingId === workOrder.id} onClick={() => cancelOrder(workOrder)}>取消工单</AppButton></>}{canUpdate && workOrder.status === 'IN_PROGRESS' && <AppButton size="sm" variant="primary" onClick={() => setCompleting(workOrder)}>完成并领料</AppButton>}</div></div>
            {(workOrder.results.length > 0 || workOrder.spares.length > 0) && <div className="mt-4 grid gap-4 lg:grid-cols-2">{workOrder.results.length > 0 && <section className="rounded-lg bg-emerald-50 p-3"><h5 className="text-sm font-semibold text-emerald-800">保养结果</h5><ol className="mt-2 space-y-1 text-sm text-emerald-900">{workOrder.results.map((item) => <li key={item.id}>✓ {item.itemName} · {item.standard}</li>)}</ol></section>}{workOrder.spares.length > 0 && <section className="rounded-lg bg-blue-50 p-3"><h5 className="text-sm font-semibold text-blue-800">备件领用</h5><ul className="mt-2 space-y-1 text-sm text-blue-900">{workOrder.spares.map((item) => <li key={item.id}>{item.material.code} · {item.material.name}：{item.stockQty} {item.stockUnitSnapshot}（{item.location.code}，批次 {item.lotAllocations.map((allocation) => allocation.lot.lotNo).join('、')}）</li>)}</ul></section>}</div>}
            <div className="mt-4 border-t border-gray-100 pt-3"><AttachmentPanel ownerType="EQUIPMENT_MAINTENANCE_WORK_ORDER" ownerId={workOrder.id} title="维修现场附件" compact readOnly={!canManageAttachments} onMessage={onMessage} /></div>
          </article>)}</div>}</section>
        </div>}
      </section>
      {planOpen && <EquipmentMaintenancePlanDialog equipmentOptions={workspace.equipmentOptions} onClose={() => setPlanOpen(false)} onSaved={load} onMessage={onMessage} />}
      {repairOpen && <EquipmentMaintenanceRepairDialog equipmentOptions={workspace.equipmentOptions} onClose={() => setRepairOpen(false)} onSaved={load} onMessage={onMessage} />}
      {completing && <EquipmentMaintenanceCompleteDialog workOrder={completing} materialOptions={workspace.materialOptions} onClose={() => setCompleting(null)} onSaved={load} onMessage={onMessage} />}
    </>
  )
}
