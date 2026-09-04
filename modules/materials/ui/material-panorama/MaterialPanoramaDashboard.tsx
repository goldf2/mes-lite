'use client'

import { ReactNode, useState } from 'react'
import type {
  AttachmentItem,
  PanoramaData,
  PanoramaModuleConfig,
  PanoramaModuleId,
  ProcessRouteSummary,
  WorkInstructionSummary,
} from '../../contracts/material-panorama'
import { formatMoney, formatNumber, panoramaModuleLabels } from '../../model/material-panorama-view'
import { MaterialPanoramaDocumentsModule, MaterialPanoramaSummaryModule } from './MaterialPanoramaOverviewModules'
import { MaterialPanoramaBomProcessModule, MaterialPanoramaCostingModule, MaterialPanoramaOrdersModule } from './MaterialPanoramaOperationsModules'
import MaterialPanoramaRecordsModule from './MaterialPanoramaRecordsModule'

function DashboardStat({ label, value, hint, tone = 'default' }: { label: string; value: string; hint: string; tone?: 'default' | 'green' | 'amber' | 'blue' }) {
  const toneClass = { default: 'text-gray-900', green: 'text-green-700', amber: 'text-amber-700', blue: 'text-blue-700' }[tone]
  return (
    <div className="min-w-0 border-b border-r border-gray-100 px-3 py-3 sm:px-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 truncate text-lg font-semibold ${toneClass}`}>{value}</div>
      <div className="mt-1 truncate text-xs text-gray-400">{hint}</div>
    </div>
  )
}

function DisclosureSection({ id, summary, expanded, onToggle, children }: { id: PanoramaModuleId; summary: string; expanded: boolean; onToggle: () => void; children: ReactNode }) {
  const meta = panoramaModuleLabels[id]
  const panelId = `material-panorama-${id}`
  return (
    <section className={`overflow-hidden rounded-lg border bg-white shadow-sm ${expanded ? 'border-blue-200' : 'border-gray-200'}`}>
      <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={onToggle} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:px-5">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-900">{meta.name}</span>
          <span className="mt-0.5 block truncate text-xs text-gray-500">{summary}</span>
        </span>
        <span aria-hidden="true" className={`shrink-0 text-lg text-gray-400 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {expanded && <div id={panelId} className="border-t border-gray-100 bg-gray-50/40 p-2.5 sm:p-3">{children}</div>}
    </section>
  )
}

function sectionSummary(id: PanoramaModuleId, data: PanoramaData, relatedRoutes: ProcessRouteSummary[]) {
  const bomCount = data.productBoms.length + data.componentBoms.length
  const attachmentCount = data.attachments.images.length + data.attachments.documents.length
  const recordCount = data.recentMaterialIns.length + data.recentStockLogs.length + data.costLayers.length
  const costSnapshotCount = data.productBoms.filter((bom) => bom.latestCostRun).length
  const summaries: Record<PanoramaModuleId, string> = {
    summary: '物料档案、完整库存余额与库位核算',
    documents: `${data.locationBalances.length} 个库位 · ${data.workInstructions.length} 篇产品文档 · ${attachmentCount} 个附件`,
    bomProcess: `${bomCount} 项 BOM 关系 · ${data.processTemplates.length} 个工艺 · ${relatedRoutes.length} 条路线`,
    costing: `${data.costObjects.length} 个成本对象 · ${costSnapshotCount} 个 BOM 成本快照`,
    orders: `${data.targetOrders.length} 个相关工单 · ${data.consumingPicks.length} 条领料记录`,
    records: `${recordCount} 条近期来料、库存流水和成本层记录`,
    notes: `${data.modelNotes.length} 条建模说明`,
  }
  return summaries[id]
}

export default function MaterialPanoramaDashboard({
  data,
  modules,
  coverImage,
  relatedRoutes,
  onOpenInstruction,
}: {
  data: PanoramaData
  modules: PanoramaModuleConfig[]
  coverImage?: AttachmentItem
  relatedRoutes: ProcessRouteSummary[]
  onOpenInstruction: (instruction: WorkInstructionSummary) => void
}) {
  const [expandedIds, setExpandedIds] = useState<Set<PanoramaModuleId>>(() => new Set<PanoramaModuleId>(['summary']))
  const visibleModules = modules.filter((module) => module.visible)
  const stock = data.stock
  const bomCount = data.productBoms.length + data.componentBoms.length
  const latestSavedCost = data.costObjects.find((item) => item.costs.length > 0)?.costs[0]
  const latestCostObject = data.costObjects.find((item) => item.costs.length > 0)
  const exceptionQty = Number(stock?.quarantineQty || 0) + Number(stock?.holdQty || 0)
  const allExpanded = visibleModules.length > 0 && visibleModules.every((module) => expandedIds.has(module.id))
  const contents: Record<PanoramaModuleId, ReactNode> = {
    summary: <MaterialPanoramaSummaryModule data={data} coverImage={coverImage} />,
    documents: <MaterialPanoramaDocumentsModule data={data} onOpenInstruction={onOpenInstruction} />,
    bomProcess: <MaterialPanoramaBomProcessModule data={data} relatedRoutes={relatedRoutes} />,
    costing: <MaterialPanoramaCostingModule data={data} relatedRoutes={relatedRoutes} />,
    orders: <MaterialPanoramaOrdersModule data={data} />,
    records: <MaterialPanoramaRecordsModule data={data} />,
    notes: <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500">{data.modelNotes.join('；')}</div>,
  }

  const toggleSection = (id: PanoramaModuleId) => setExpandedIds((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const setAllSections = (expanded: boolean) => setExpandedIds(new Set(expanded ? visibleModules.map((module) => module.id) : []))

  return (
    <div className="space-y-3">
      <section aria-label="物料关键指标" className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
          <DashboardStat label="可用库存" value={`${formatNumber(stock?.availableQty)} ${data.material.stockUnit}`} hint={`当前库存 ${formatNumber(stock?.qty)} ${data.material.stockUnit}`} tone="green" />
          <DashboardStat label="待检 / 冻结" value={`${formatNumber(stock?.quarantineQty)} / ${formatNumber(stock?.holdQty)}`} hint={`合计 ${formatNumber(exceptionQty)} ${data.material.stockUnit}`} tone={exceptionQty > 0 ? 'amber' : 'default'} />
          <DashboardStat label="BOM 关系" value={`${bomCount} 项`} hint={`作为产出 ${data.productBoms.length} · 作为投入 ${data.componentBoms.length}`} tone="blue" />
          <DashboardStat label="已存单位材料成本" value={latestSavedCost && latestCostObject ? `${formatMoney(latestSavedCost.materialCostPerUnit)} / ${latestCostObject.unit}` : '暂无'} hint={`${data.costObjects.length} 个加工成本对象`} />
          <DashboardStat label="当前库存单价" value={`${formatMoney(stock?.stockUnitCost)} / ${data.material.stockUnit}`} hint={`库存金额 ${formatMoney(stock?.totalCost)}`} />
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">详细资料</h2>
          <p className="mt-0.5 text-xs text-gray-500">按需展开，避免一次显示全部信息。</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setAllSections(true)} disabled={allExpanded} className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">全部展开</button>
          <button type="button" onClick={() => setAllSections(false)} disabled={expandedIds.size === 0} className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">全部收起</button>
        </div>
      </div>

      <div className="space-y-2">
        {visibleModules.map((module) => (
          <DisclosureSection key={module.id} id={module.id} summary={sectionSummary(module.id, data, relatedRoutes)} expanded={expandedIds.has(module.id)} onToggle={() => toggleSection(module.id)}>
            {contents[module.id]}
          </DisclosureSection>
        ))}
      </div>
    </div>
  )
}
