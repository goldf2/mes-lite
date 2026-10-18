'use client'

import { useEffect, useMemo, useState } from 'react'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import AppButton from '@/app/components/AppButton'
import { WorkspaceLauncher, type WorkspaceFunctionItem } from './WorkspacePages'
import type { WorkspaceFunctionKey, WorkspacePreferenceValue } from '@/lib/workspace'
import { loadDashboard } from '../client/dashboard-api'
import type { DashboardData } from '../contracts/dashboard'
import { buildDashboardMetricItems, buildDashboardPendingItems, buildDashboardWorkloadItems, normalizeDashboard } from '../model/dashboard-view'
import { DashboardBarPanel, DashboardKpiGrid, DashboardSalesDeliveryPanel, DashboardSignalGrid, ProductionStatusOverview, RoleTaskBoard, StockAlertList } from './DashboardPanels'

interface DashboardPageProps {
  items: WorkspaceFunctionItem[]
  preference: WorkspacePreferenceValue
  onOpen: (functionKey: WorkspaceFunctionKey, task?: string) => void
  onOpenAllFunctions: () => void
  onSave: (next: Pick<WorkspacePreferenceValue, 'mode' | 'layout' | 'pinned'>) => Promise<void>
  preferenceBusy?: boolean
}

export default function DashboardPage({
  items,
  preference,
  onOpen,
  onOpenAllFunctions,
  onSave,
  preferenceBusy,
}: DashboardPageProps) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let cancelled = false
    setDashboard(null)
    setError('')
    loadDashboard()
      .then((data) => { if (!cancelled) setDashboard(data) })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : '业务概览加载失败')
      })
    return () => {
      cancelled = true
    }
  }, [retry])

  const view = useMemo(() => normalizeDashboard(dashboard || {}), [dashboard])

  const metricItems = buildDashboardMetricItems(view)
  const workloadItems = buildDashboardWorkloadItems(view)
  const pendingItems = buildDashboardPendingItems(view)

  return (
    <section aria-label="MES Lite 首页" className="space-y-6">
      {dashboard && <RoleTaskBoard sections={view.roleTaskSections} onOpen={onOpen} />}
      <WorkspaceLauncher
        items={items.filter((item) => item.key !== 'dashboard')}
        preference={preference}
        onOpen={onOpen}
        onOpenAllFunctions={onOpenAllFunctions}
        onSave={onSave}
        preferenceBusy={preferenceBusy}
      />
      {error ? (
        <section role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <div><h2 className="text-sm font-semibold text-red-800">业务概览加载失败</h2><p className="mt-1 text-sm text-red-700">{error}，可重试或通过上方入口继续工作。</p></div>
          <AppButton onClick={() => setRetry((current) => current + 1)}>重新加载</AppButton>
        </section>
      ) : !dashboard ? <AppLoadingIndicator label="正在加载业务概览..." /> : (
        <>
          <DashboardKpiGrid items={metricItems} />
          <DashboardSalesDeliveryPanel references={view.salesDeliveryReferences} onOpen={() => onOpen('salesOrders')} />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <DashboardBarPanel title="生产负荷" items={workloadItems} />
            <DashboardSignalGrid title="待处理事项" items={pendingItems} />
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <ProductionStatusOverview
              orderItems={view.statusDistribution}
              actualItems={view.productionActualStatusDistribution}
            />
            <StockAlertList stocks={view.lowStocks} />
          </div>
        </>
      )}
    </section>
  )
}
