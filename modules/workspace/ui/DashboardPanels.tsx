import type { DashboardMetricItem, DashboardSalesDeliveryReference, DashboardStatusItem, DashboardStockAlert } from '../contracts/dashboard'
import type { RoleTaskSection } from '../model/role-task-view'
import type { WorkspaceFunctionKey } from '@/lib/workspace'

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
  return dashboardToneMap[tone] || { border: 'border-gray-200', text: 'text-gray-700', fill: 'bg-gray-500', soft: 'bg-gray-100' }
}

export function RoleTaskBoard({ sections, onOpen }: { sections: RoleTaskSection[]; onOpen: (key: WorkspaceFunctionKey, task?: string) => void }) {
  if (sections.length === 0) return null
  const openTask = (functionKey: WorkspaceFunctionKey, task: string) => onOpen(functionKey, task)
  return <section className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-3 shadow-sm sm:p-4"><div className="mb-4"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">岗位任务工作台</div><h2 className="mt-1 text-lg font-semibold text-gray-950">先处理我的待办</h2><p className="mt-1 text-sm text-gray-500">任务和动作按当前账号的服务端权限生成，没有权限的岗位不会收到对应入口。</p></div><div className="space-y-4">{sections.map((section) => <div key={section.key}><div className="mb-2 flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-semibold text-gray-900">{section.label}</h3><span className="text-xs text-gray-500">{section.description}</span></div><div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">{section.items.map((item) => { const tone = getDashboardTone(item.tone); return <button key={item.key} type="button" onClick={() => openTask(item.functionKey, item.task)} className={`group flex min-h-24 items-center gap-3 rounded-lg border bg-white p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${tone.border}`}><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-2xl font-semibold ${tone.soft} ${tone.text}`}>{item.value}</span><span className="min-w-0"><span className="block text-sm font-semibold text-gray-900 group-hover:text-blue-700">{item.label}</span><span className="mt-1 block text-xs leading-5 text-gray-500">{item.description}</span></span></button> })}</div></div>)}</div></section>
}

export function DashboardKpiGrid({ items }: { items: DashboardMetricItem[] }) {
  const maxValue = Math.max(1, ...items.map((item) => Number(item.value) || 0))
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((item) => {
        const tone = getDashboardTone(item.tone)
        const percent = Math.max(6, Math.min(100, ((Number(item.value) || 0) / maxValue) * 100))
        return (
          <div key={item.label} className={`rounded-lg border bg-white p-4 shadow-sm ${tone.border}`}>
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-xs font-medium text-gray-500">{item.hint}</div><div className="mt-1 truncate text-sm font-semibold text-gray-800">{item.label}</div></div><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.fill}`} /></div>
            <div className="mt-4 flex items-end justify-between gap-3"><div className="text-3xl font-semibold leading-none text-gray-950">{item.value ?? 0}</div><div className={`h-10 w-16 rounded ${tone.soft} p-1`}><div className="flex h-full items-end gap-1">{[0.42, 0.72, 0.55, 1].map((ratio, index) => <span key={index} className={`flex-1 rounded-sm ${tone.fill}`} style={{ height: `${Math.max(18, percent * ratio)}%`, opacity: 0.5 + index * 0.12 }} />)}</div></div></div>
          </div>
        )
      })}
    </div>
  )
}

function quantityText(value: number) {
  return Number(value || 0).toFixed(3).replace(/\.?0+$/, '') || '0'
}

export function DashboardSalesDeliveryPanel({ references, onOpen }: { references: DashboardSalesDeliveryReference[]; onOpen: () => void }) {
  const visible = references.filter((item) => item.remainingQty > 0 || item.overQty > 0).slice(0, 8)
  return <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-gray-900">客户物料交付参考</h3><p className="mt-1 text-xs text-gray-500">按客户＋物料动态汇总，不绑定订单，也不限制超发。</p></div><button type="button" onClick={onOpen} className="text-sm font-medium text-blue-700 hover:underline">查看销售订单</button></div>{visible.length === 0 ? <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">当前没有未发或超发参考项</div> : <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{visible.map((item) => <div key={`${item.customerId}:${item.materialId}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-semibold text-gray-900">{item.material ? `${item.material.code} · ${item.material.name}` : item.materialId}</div><div className="mt-0.5 truncate text-xs text-gray-500">{item.customer ? `${item.customer.code} · ${item.customer.name}` : item.customerId}</div></div>{item.overQty > 0 ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">超发 {quantityText(item.overQty)} {item.unit}</span> : <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">未发 {quantityText(item.remainingQty)} {item.unit}</span>}</div><div className="mt-3 grid grid-cols-3 gap-2 text-xs text-gray-600"><div>需求 <strong className="text-gray-900">{quantityText(item.orderedQty)}</strong></div><div>待发 <strong className="text-gray-900">{quantityText(item.pendingQty)}</strong></div><div>已发 <strong className="text-gray-900">{quantityText(item.shippedQty)}</strong></div></div></div>)}</div>}</section>
}

export function DashboardBarPanel({ title, items }: { title: string; items: Array<Omit<DashboardMetricItem, 'hint'>> }) {
  const maxValue = Math.max(1, ...items.map((item) => Number(item.value) || 0))
  return <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"><div className="mb-5 flex items-center justify-between"><h3 className="font-semibold text-gray-900">{title}</h3><span className="text-xs text-gray-500">今日 / 本月</span></div><div className="space-y-4">{items.map((item) => { const tone = getDashboardTone(item.tone); const width = Math.max(5, Math.min(100, ((Number(item.value) || 0) / maxValue) * 100)); return <div key={item.label}><div className="mb-1.5 flex items-center justify-between text-sm"><span className="font-medium text-gray-700">{item.label}</span><span className="font-semibold text-gray-950">{item.value ?? 0}</span></div><div className={`h-3 overflow-hidden rounded-full ${tone.soft}`}><div className={`h-full rounded-full ${tone.fill}`} style={{ width: `${width}%` }} /></div></div> })}</div></div>
}

export function DashboardSignalGrid({ title, items }: { title: string; items: DashboardMetricItem[] }) {
  const maxValue = Math.max(1, ...items.map((item) => Number(item.value) || 0))
  return <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"><div className="mb-5 flex items-center justify-between"><h3 className="font-semibold text-gray-900">{title}</h3><span className="text-xs text-gray-500">实时状态</span></div><div className="space-y-4">{items.map((item) => { const tone = getDashboardTone(item.tone); const width = Math.max(6, Math.min(100, ((Number(item.value) || 0) / maxValue) * 100)); return <div key={item.label} className="rounded-lg border border-gray-100 p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-gray-800">{item.label}</div><div className="mt-0.5 text-xs text-gray-500">{item.hint}</div></div><div className={`text-2xl font-semibold leading-none ${tone.text}`}>{item.value ?? 0}</div></div><div className={`mt-3 h-2.5 overflow-hidden rounded-full ${tone.soft}`}><div className={`h-full rounded-full ${tone.fill}`} style={{ width: `${width}%` }} /></div></div> })}</div></div>
}

function DashboardStatusSection({ title, totalLabel, emptyText, items, labels, palette }: { title: string; totalLabel: string; emptyText: string; items: DashboardStatusItem[]; labels: Record<string, string>; palette: Record<string, string> }) {
  const normalizedItems = [...items].sort((a, b) => (b.count || 0) - (a.count || 0))
  const total = normalizedItems.reduce((sum, item) => sum + (Number(item.count) || 0), 0)
  let cursor = 0
  const segments = normalizedItems.map((item) => { const share = total > 0 ? (Number(item.count) / total) * 100 : 0; const start = cursor; const end = cursor + share; cursor = end; return { ...item, start, end, color: palette[item.status] || '#64748b' } })
  const gradient = segments.length ? `conic-gradient(${segments.map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`).join(', ')})` : 'conic-gradient(#e5e7eb 0% 100%)'
  return <section className="rounded-lg border border-gray-100 p-4"><div className="mb-4 flex items-center justify-between gap-3"><h4 className="text-sm font-semibold text-gray-800">{title}</h4><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">合计 {total}</span></div><div className="grid grid-cols-1 items-center gap-5 sm:grid-cols-[136px_minmax(0,1fr)]"><div className="flex justify-center"><div className="relative h-32 w-32 rounded-full shadow-inner" style={{ background: gradient }}><div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-white shadow-sm"><div className="text-2xl font-semibold text-gray-900">{total}</div><div className="text-xs text-gray-500">{totalLabel}</div></div></div></div>{segments.length === 0 ? <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-500">{emptyText}</div> : <div className="space-y-2.5">{segments.map((item) => <div key={item.status} className="flex items-center justify-between gap-3 text-sm"><div className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /><span className="truncate font-medium text-gray-700">{labels[item.status] || item.status}</span></div><span className="shrink-0 font-semibold text-gray-950">{item.count}</span></div>)}</div>}</div></section>
}

export function ProductionStatusOverview({ orderItems, actualItems }: { orderItems: DashboardStatusItem[]; actualItems: DashboardStatusItem[] }) {
  const labels = { DRAFT: '草稿', RELEASED: '已发布', IN_PROGRESS: '进行中', COMPLETED: '已完成', CANCELLED: '已取消', CONFIRMED: '已发布', PICKED: '已发布', RUNNING: '进行中', QC_WAITING: '进行中', QC_DONE: '进行中' }
  const orderPalette = { DRAFT: '#94a3b8', RELEASED: '#3b82f6', IN_PROGRESS: '#f97316', COMPLETED: '#22c55e', CANCELLED: '#ef4444', CONFIRMED: '#3b82f6', PICKED: '#3b82f6', RUNNING: '#f97316', QC_WAITING: '#f97316', QC_DONE: '#f97316' }
  const actualLabels = { DRAFT: '草稿', CONFIRMED: '已确认', REVERSED: '已冲销' }
  const actualPalette = { DRAFT: '#94a3b8', CONFIRMED: '#22c55e', REVERSED: '#ef4444' }
  return <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"><div className="mb-5 flex items-center justify-between"><h3 className="font-semibold text-gray-900">生产状态分布</h3><span className="text-xs text-gray-500">生产订单 / 班后实绩</span></div><div className="space-y-4"><DashboardStatusSection title="生产订单" totalLabel="总订单" emptyText="暂无生产订单状态数据" items={orderItems} labels={labels} palette={orderPalette} /><DashboardStatusSection title="班后生产实绩" totalLabel="总实绩" emptyText="暂无班后实绩状态数据" items={actualItems} labels={actualLabels} palette={actualPalette} /></div></div>
}

export function StockAlertList({ stocks }: { stocks: DashboardStockAlert[] }) {
  const sortedStocks = [...stocks].sort((a, b) => Number(a.availableQty ?? 0) - Number(b.availableQty ?? 0)).slice(0, 8)
  return <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"><div className="mb-5 flex items-center justify-between"><h3 className="font-semibold text-gray-900">库存预警</h3><span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">低于 10</span></div>{sortedStocks.length === 0 ? <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-500">暂无库存预警</div> : <div className="space-y-3">{sortedStocks.map((stock, index) => { const name = stock.material?.name || stock.product?.name || '未命名库存'; const code = stock.material?.code || stock.product?.sku || '-'; const available = Number(stock.availableQty ?? 0); const level = available <= 2 ? '严重' : available <= 5 ? '紧急' : '关注'; const levelClass = available <= 2 ? 'border-red-200 bg-red-50 text-red-700' : available <= 5 ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-yellow-200 bg-yellow-50 text-yellow-700'; const barClass = available <= 2 ? 'bg-red-500' : available <= 5 ? 'bg-orange-500' : 'bg-yellow-500'; const width = Math.max(4, Math.min(100, (available / 10) * 100)); return <div key={stock.id} className="rounded-lg border border-gray-100 p-3"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-gray-100 text-xs font-semibold text-gray-600">{index + 1}</span><div className="truncate text-sm font-medium text-gray-900">{name}</div></div><div className="mt-1 truncate text-xs text-gray-500">{code}</div></div><div className={`shrink-0 rounded-full border px-2 py-1 text-xs font-medium ${levelClass}`}>{level}</div></div><div className="mt-3 flex items-center justify-between text-sm"><span className="text-gray-500">可用库存</span><span className="font-semibold text-gray-900">{available}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${barClass}`} style={{ width: `${width}%` }} /></div></div> })}</div>}</div>
}
