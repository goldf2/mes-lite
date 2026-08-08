'use client'

import { useEffect, useMemo, useState } from 'react'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import { WorkspaceLauncher } from '@/app/components/WorkspacePages'
import type { WorkspaceFunctionItem } from '@/app/components/WorkspacePages'
import type { WorkspaceFunctionKey, WorkspacePreferenceValue } from '@/lib/workspace'

interface DashboardStatusItem {
  status: string
  count: number
}

interface DashboardStockAlert {
  id: string
  availableQty?: number
  material?: { name?: string; code?: string } | null
  product?: { name?: string; sku?: string } | null
}

interface DashboardData {
  todayOrderCount?: number
  todayOrders?: number
  monthOrderCount?: number
  monthOrders?: number
  todayProductionActualCount?: number
  monthProductionActualCount?: number
  todayProduction?: number
  monthProduction?: number
  pendingProductionActualCount?: number
  pendingMaterialInCount?: number
  pendingMaterialIns?: number
  pendingShipmentCount?: number
  pendingShipments?: number
  pendingReturnCount?: number
  pendingReturns?: number
  lowStocks?: DashboardStockAlert[]
  alertStocks?: DashboardStockAlert[]
  statusDistribution?: DashboardStatusItem[]
  orderStatusDist?: DashboardStatusItem[]
  productionActualStatusDistribution?: DashboardStatusItem[]
}

interface DashboardPageProps {
  items: WorkspaceFunctionItem[]
  preference: WorkspacePreferenceValue
  onOpen: (functionKey: WorkspaceFunctionKey) => void
  onOpenAllFunctions: () => void
  onSave: (next: Pick<WorkspacePreferenceValue, 'mode' | 'layout' | 'pinned'>) => Promise<void>
}

const productionOrderStatusLabels: Record<string, string> = {
  DRAFT: '草稿',
  CONFIRMED: '已确认',
  PICKED: '已领料',
  RUNNING: '生产中',
  QC_WAITING: '待质检',
  QC_DONE: '质检完成',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
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
    fetch('/api/stats/dashboard')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('dashboard request failed')))
      .then((payload) => {
        if (!cancelled) setDashboard(payload.data || {})
      })
      .catch(() => {
        if (!cancelled) setDashboard({})
      })
    return () => {
      cancelled = true
    }
  }, [])

  const view = useMemo(() => ({
    todayOrderCount: dashboard?.todayOrderCount ?? dashboard?.todayOrders ?? 0,
    monthOrderCount: dashboard?.monthOrderCount ?? dashboard?.monthOrders ?? 0,
    todayProductionActualCount: dashboard?.todayProductionActualCount ?? 0,
    monthProductionActualCount: dashboard?.monthProductionActualCount ?? 0,
    todayProduction: dashboard?.todayProduction ?? 0,
    monthProduction: dashboard?.monthProduction ?? 0,
    pendingProductionActualCount: dashboard?.pendingProductionActualCount ?? 0,
    pendingMaterialInCount: dashboard?.pendingMaterialInCount ?? dashboard?.pendingMaterialIns ?? 0,
    pendingShipmentCount: dashboard?.pendingShipmentCount ?? dashboard?.pendingShipments ?? 0,
    pendingReturnCount: dashboard?.pendingReturnCount ?? dashboard?.pendingReturns ?? 0,
    lowStocks: dashboard?.lowStocks ?? dashboard?.alertStocks ?? [],
    statusDistribution: dashboard?.statusDistribution ?? dashboard?.orderStatusDist ?? [],
    productionActualStatusDistribution: dashboard?.productionActualStatusDistribution ?? [],
  }), [dashboard])

  if (!dashboard) return <AppLoadingIndicator label="正在加载仪表盘..." />

  const numberText = (value: number) => Number(value || 0).toFixed(3).replace(/\.?0+$/, '') || '0'
  const metricItems = [
    { label: '今日生产订单', value: view.todayOrderCount, tone: 'blue', hint: `班后实绩 ${view.todayProductionActualCount}` },
    { label: '本月生产订单', value: view.monthOrderCount, tone: 'indigo', hint: `班后实绩 ${view.monthProductionActualCount}` },
    { label: '今日确认产量', value: view.todayProduction, tone: 'green', hint: `主产出 ${numberText(view.todayProduction)}` },
    { label: '本月确认产量', value: view.monthProduction, tone: 'emerald', hint: `主产出 ${numberText(view.monthProduction)}` },
    { label: '待收货', value: view.pendingMaterialInCount, tone: 'yellow', hint: '来料' },
    { label: '待发货', value: view.pendingShipmentCount, tone: 'orange', hint: '出库' },
    { label: '退货待处理', value: view.pendingReturnCount, tone: 'red', hint: '售后' },
    { label: '库存预警', value: view.lowStocks.length, tone: 'pink', hint: '低库存' },
  ]
  const workloadItems = [
    { label: '今日订单', value: view.todayOrderCount, tone: 'blue' },
    { label: '今日实绩', value: view.todayProductionActualCount, tone: 'indigo' },
    { label: '本月订单', value: view.monthOrderCount, tone: 'blue' },
    { label: '本月实绩', value: view.monthProductionActualCount, tone: 'indigo' },
    { label: '今日主产出', value: view.todayProduction, tone: 'green' },
    { label: '本月主产出', value: view.monthProduction, tone: 'emerald' },
  ]
  const pendingItems = [
    { label: '生产实绩待确认', value: view.pendingProductionActualCount, tone: 'indigo', hint: '班后实绩草稿' },
    { label: '待收货', value: view.pendingMaterialInCount, tone: 'yellow', hint: '原材料入库' },
    { label: '待发货', value: view.pendingShipmentCount, tone: 'orange', hint: '成品出库' },
    { label: '退货待处理', value: view.pendingReturnCount, tone: 'red', hint: '售后返库' },
    { label: '库存预警', value: view.lowStocks.length, tone: 'pink', hint: '低于阈值' },
  ]

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

const dashboardToneMap: Record<string, { border: string; text: string; fill: string; soft: string }> = {
  blue: { border: 'border-blue-200', text: 'text-blue-700', fill: 'bg-blue-500', soft: 'bg-blue-100' },
  indigo: { border: 'border-indigo-200', text: 'text-indigo-700', fill: 'bg-indigo-500', soft: 'bg-indigo-100' },
  green: { border: 'border-green-200', text: 'text-green-700', fill: 'bg-green-500', soft: 'bg-green-100' },
  emerald: { border: 'border-emerald-200', text: 'text-emerald-700', fill: 'bg-emerald-500', soft: 'bg-emerald-100' },
  yellow: { border: 'border-yellow-200', text: 'text-yellow-700', fill: 'bg-yellow-500', soft: 'bg-yellow-100' },
  orange: { border: 'border-orange-200', text: 'text-orange-700', fill: 'bg-orange-500', soft: 'bg-orange-100' },
  red: { border: 'border-red-200', text: 'text-red-700', fill: 'bg-red-500', soft: 'bg-red-100' },
  pink: { border: 'border-pink-200', text: 'text-pink-700', fill: 'bg-pink-500', soft: 'bg-pink-100' },
}

function getDashboardTone(tone: string) {
  return dashboardToneMap[tone] || {
    border: 'border-gray-200',
    text: 'text-gray-700',
    fill: 'bg-gray-500',
    soft: 'bg-gray-100',
  }
}

function DashboardKpiGrid({ items }: { items: { label: string; value: number; tone: string; hint: string }[] }) {
  const maxValue = Math.max(1, ...items.map((item) => Number(item.value) || 0))

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((item) => {
        const tone = getDashboardTone(item.tone)
        const percent = Math.max(6, Math.min(100, ((Number(item.value) || 0) / maxValue) * 100))
        return (
          <div key={item.label} className={`rounded-lg border bg-white p-4 shadow-sm ${tone.border}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-500">{item.hint}</div>
                <div className="mt-1 truncate text-sm font-semibold text-gray-800">{item.label}</div>
              </div>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.fill}`} />
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div className="text-3xl font-semibold leading-none text-gray-950">{item.value ?? 0}</div>
              <div className={`h-10 w-16 rounded ${tone.soft} p-1`}>
                <div className="flex h-full items-end gap-1">
                  {[0.42, 0.72, 0.55, 1].map((ratio, index) => (
                    <span key={index} className={`flex-1 rounded-sm ${tone.fill}`} style={{ height: `${Math.max(18, percent * ratio)}%`, opacity: 0.5 + index * 0.12 }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DashboardBarPanel({ title, items }: { title: string; items: { label: string; value: number; tone: string }[] }) {
  const maxValue = Math.max(1, ...items.map((item) => Number(item.value) || 0))
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-500">今日 / 本月</span>
      </div>
      <div className="space-y-4">
        {items.map((item) => {
          const tone = getDashboardTone(item.tone)
          const width = Math.max(5, Math.min(100, ((Number(item.value) || 0) / maxValue) * 100))
          return (
            <div key={item.label}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">{item.label}</span>
                <span className="font-semibold text-gray-950">{item.value ?? 0}</span>
              </div>
              <div className={`h-3 overflow-hidden rounded-full ${tone.soft}`}>
                <div className={`h-full rounded-full ${tone.fill}`} style={{ width: `${width}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DashboardSignalGrid({ title, items }: { title: string; items: { label: string; value: number; tone: string; hint: string }[] }) {
  const maxValue = Math.max(1, ...items.map((item) => Number(item.value) || 0))
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-500">实时状态</span>
      </div>
      <div className="space-y-4">
        {items.map((item) => {
          const tone = getDashboardTone(item.tone)
          const width = Math.max(6, Math.min(100, ((Number(item.value) || 0) / maxValue) * 100))
          return (
            <div key={item.label} className="rounded-lg border border-gray-100 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-800">{item.label}</div>
                  <div className="mt-0.5 text-xs text-gray-500">{item.hint}</div>
                </div>
                <div className={`text-2xl font-semibold leading-none ${tone.text}`}>{item.value ?? 0}</div>
              </div>
              <div className={`mt-3 h-2.5 overflow-hidden rounded-full ${tone.soft}`}>
                <div className={`h-full rounded-full ${tone.fill}`} style={{ width: `${width}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DashboardStatusSection({ title, totalLabel, emptyText, items, labels, palette }: {
  title: string
  totalLabel: string
  emptyText: string
  items: DashboardStatusItem[]
  labels: Record<string, string>
  palette: Record<string, string>
}) {
  const normalizedItems = [...items].sort((a, b) => (b.count || 0) - (a.count || 0))
  const total = normalizedItems.reduce((sum, item) => sum + (Number(item.count) || 0), 0)
  let cursor = 0
  const segments = normalizedItems.map((item) => {
    const share = total > 0 ? (Number(item.count) / total) * 100 : 0
    const start = cursor
    const end = cursor + share
    cursor = end
    return { ...item, start, end, color: palette[item.status] || '#64748b' }
  })
  const gradient = segments.length
    ? `conic-gradient(${segments.map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`).join(', ')})`
    : 'conic-gradient(#e5e7eb 0% 100%)'

  return (
    <section className="rounded-lg border border-gray-100 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">合计 {total}</span>
      </div>
      <div className="grid grid-cols-1 items-center gap-5 sm:grid-cols-[136px_minmax(0,1fr)]">
        <div className="flex justify-center">
          <div className="relative h-32 w-32 rounded-full shadow-inner" style={{ background: gradient }}>
            <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-white shadow-sm">
              <div className="text-2xl font-semibold text-gray-900">{total}</div>
              <div className="text-xs text-gray-500">{totalLabel}</div>
            </div>
          </div>
        </div>
        {segments.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-500">{emptyText}</div>
        ) : (
          <div className="space-y-2.5">
            {segments.map((item) => (
              <div key={item.status} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="truncate font-medium text-gray-700">{labels[item.status] || item.status}</span>
                </div>
                <span className="shrink-0 font-semibold text-gray-950">{item.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function ProductionStatusOverview({ orderItems, actualItems }: { orderItems: DashboardStatusItem[]; actualItems: DashboardStatusItem[] }) {
  const orderPalette: Record<string, string> = {
    DRAFT: '#94a3b8', CONFIRMED: '#3b82f6', PICKED: '#eab308', RUNNING: '#f97316',
    QC_WAITING: '#a855f7', QC_DONE: '#6366f1', COMPLETED: '#22c55e', CANCELLED: '#ef4444',
  }
  const actualLabels = { DRAFT: '草稿', CONFIRMED: '已确认', REVERSED: '已冲销' }
  const actualPalette = { DRAFT: '#94a3b8', CONFIRMED: '#22c55e', REVERSED: '#ef4444' }
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">生产状态分布</h3>
        <span className="text-xs text-gray-500">生产订单 / 班后实绩</span>
      </div>
      <div className="space-y-4">
        <DashboardStatusSection title="生产订单" totalLabel="总订单" emptyText="暂无生产订单状态数据" items={orderItems} labels={productionOrderStatusLabels} palette={orderPalette} />
        <DashboardStatusSection title="班后生产实绩" totalLabel="总实绩" emptyText="暂无班后实绩状态数据" items={actualItems} labels={actualLabels} palette={actualPalette} />
      </div>
    </div>
  )
}

function StockAlertList({ stocks }: { stocks: DashboardStockAlert[] }) {
  const sortedStocks = [...stocks].sort((a, b) => Number(a.availableQty ?? 0) - Number(b.availableQty ?? 0)).slice(0, 8)
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">库存预警</h3>
        <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">低于 10</span>
      </div>
      {sortedStocks.length === 0 ? (
        <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-500">暂无库存预警</div>
      ) : (
        <div className="space-y-3">
          {sortedStocks.map((stock, index) => {
            const name = stock.material?.name || stock.product?.name || '未命名库存'
            const code = stock.material?.code || stock.product?.sku || '-'
            const available = Number(stock.availableQty ?? 0)
            const level = available <= 2 ? '严重' : available <= 5 ? '紧急' : '关注'
            const levelClass = available <= 2 ? 'border-red-200 bg-red-50 text-red-700' : available <= 5 ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-yellow-200 bg-yellow-50 text-yellow-700'
            const barClass = available <= 2 ? 'bg-red-500' : available <= 5 ? 'bg-orange-500' : 'bg-yellow-500'
            const width = Math.max(4, Math.min(100, (available / 10) * 100))
            return (
              <div key={stock.id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gray-100 text-xs font-semibold text-gray-600">{index + 1}</span>
                      <div className="truncate text-sm font-medium text-gray-900">{name}</div>
                    </div>
                    <div className="mt-1 truncate text-xs text-gray-500">{code}</div>
                  </div>
                  <div className={`shrink-0 rounded-full border px-2 py-1 text-xs font-medium ${levelClass}`}>{level}</div>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-gray-500">可用库存</span>
                  <span className="font-semibold text-gray-900">{available}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div className={`h-full rounded-full ${barClass}`} style={{ width: `${width}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
