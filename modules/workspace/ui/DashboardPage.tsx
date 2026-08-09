'use client'

import { useEffect, useMemo, useState } from 'react'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import { WorkspaceLauncher } from '@/app/components/WorkspacePages'
import type { WorkspaceFunctionItem } from '@/app/components/WorkspacePages'
import type { WorkspaceFunctionKey, WorkspacePreferenceValue } from '@/lib/workspace'
import { loadDashboard } from '../client/dashboard-api'
import type { DashboardData } from '../contracts/dashboard'
import { buildDashboardMetricItems, buildDashboardPendingItems, buildDashboardWorkloadItems, normalizeDashboard } from '../model/dashboard-view'
import { DashboardBarPanel, DashboardKpiGrid, DashboardSignalGrid, ProductionStatusOverview, StockAlertList } from './DashboardPanels'

interface DashboardPageProps {
  items: WorkspaceFunctionItem[]
  preference: WorkspacePreferenceValue
  onOpen: (functionKey: WorkspaceFunctionKey) => void
  onOpenAllFunctions: () => void
  onSave: (next: Pick<WorkspacePreferenceValue, 'mode' | 'layout' | 'pinned'>) => Promise<void>
}

export default function DashboardPage({
  items,
  preference,
  onOpen,
  onOpenAllFunctions,
  onSave,
}: DashboardPageProps) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)

  useEffect(() => {
    let cancelled = false
    setDashboard(null)
    loadDashboard()
      .then((data) => { if (!cancelled) setDashboard(data) })
      .catch(() => {
        if (!cancelled) setDashboard({})
      })
    return () => {
      cancelled = true
    }
  }, [])

  const view = useMemo(() => normalizeDashboard(dashboard || {}), [dashboard])

  if (!dashboard) return <AppLoadingIndicator label="正在加载仪表盘..." />

  const metricItems = buildDashboardMetricItems(view)
  const workloadItems = buildDashboardWorkloadItems(view)
  const pendingItems = buildDashboardPendingItems(view)

  return (
    <div className="space-y-6">
      <WorkspaceLauncher
        items={items.filter((item) => item.key !== 'dashboard')}
        preference={preference}
        onOpen={onOpen}
        onOpenAllFunctions={onOpenAllFunctions}
        onSave={onSave}
      />
      <DashboardKpiGrid items={metricItems} />
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
    </div>
  )
}
