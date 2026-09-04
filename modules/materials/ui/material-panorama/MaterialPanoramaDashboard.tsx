'use client'

import { ReactNode, useState } from 'react'
import { SplitWorkspace } from '@/app/components/layout'
import type {
  AttachmentItem,
  PanoramaData,
  PanoramaModuleConfig,
  PanoramaModuleId,
  ProcessRouteSummary,
  WorkInstructionSummary,
} from '../../contracts/material-panorama'
import { formatMoney, formatNumber, panoramaModuleLabels, togglePanoramaSection } from '../../model/material-panorama-view'
import { MaterialPanoramaDocumentsModule, MaterialPanoramaSummaryModule } from './MaterialPanoramaOverviewModules'
import { MaterialPanoramaBomProcessModule, MaterialPanoramaCostingModule, MaterialPanoramaOrdersModule } from './MaterialPanoramaOperationsModules'
import MaterialPanoramaRecordsModule from './MaterialPanoramaRecordsModule'

function DashboardStat({ label, value, hint, tone = 'default', wide = false }: { label: string; value: string; hint: string; tone?: 'default' | 'green' | 'amber' | 'blue'; wide?: boolean }) {
  const toneClass = { default: 'text-gray-900', green: 'text-green-700', amber: 'text-amber-700', blue: 'text-blue-700' }[tone]
  return (
    <div className={`min-w-0 rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-3 sm:px-4 ${wide ? 'sm:col-span-2' : ''}`}>
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
  const [activeSectionId, setActiveSectionId] = useState<PanoramaModuleId | null>(null)
  const visibleModules = modules.filter((module) => module.visible)
  const stock = data.stock
  const bomCount = data.productBoms.length + data.componentBoms.length
  const latestSavedCost = data.costObjects.find((item) => item.costs.length > 0)?.costs[0]
  const latestCostObject = data.costObjects.find((item) => item.costs.length > 0)
  const exceptionQty = Number(stock?.quarantineQty || 0) + Number(stock?.holdQty || 0)
  const contents: Record<PanoramaModuleId, ReactNode> = {
    summary: <MaterialPanoramaSummaryModule data={data} coverImage={coverImage} />,
    documents: <MaterialPanoramaDocumentsModule data={data} onOpenInstruction={onOpenInstruction} />,
    bomProcess: <MaterialPanoramaBomProcessModule data={data} relatedRoutes={relatedRoutes} />,
    costing: <MaterialPanoramaCostingModule data={data} relatedRoutes={relatedRoutes} />,
    orders: <MaterialPanoramaOrdersModule data={data} />,
    records: <MaterialPanoramaRecordsModule data={data} />,
    notes: <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500">{data.modelNotes.join('；')}</div>,
  }

  const toggleSection = (id: PanoramaModuleId) => setActiveSectionId((current) => togglePanoramaSection(current, id))

  return (
    <SplitWorkspace storageKey="mes-lite.materialPanorama.splitPercent.v1" primaryLabel="物料纵览" secondaryLabel="物料明细" defaultPrimaryPercent={35} minPrimaryPercent={28} maxPrimaryPercent={48}>
      <aside className="space-y-3 xl:sticky xl:top-0" data-panorama-overview>
        <section aria-label="物料纵览" className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-gray-900">纵览</h2>
            <p className="mt-0.5 truncate text-xs text-gray-500">{data.material.spec || '未填写规格'} · {data.material.customer?.name || '通用/未绑定客户'}</p>
          </div>
          <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2 sm:p-3">
            <DashboardStat label="可用库存" value={`${formatNumber(stock?.availableQty)} ${data.material.stockUnit}`} hint={`当前库存 ${formatNumber(stock?.qty)} ${data.material.stockUnit}`} tone="green" />
            <DashboardStat label="待检 / 冻结" value={`${formatNumber(stock?.quarantineQty)} / ${formatNumber(stock?.holdQty)}`} hint={`合计 ${formatNumber(exceptionQty)} ${data.material.stockUnit}`} tone={exceptionQty > 0 ? 'amber' : 'default'} />
            <DashboardStat label="BOM 关系" value={`${bomCount} 项`} hint={`作为产出 ${data.productBoms.length} · 作为投入 ${data.componentBoms.length}`} tone="blue" />
            <DashboardStat label="已存单位材料成本" value={latestSavedCost && latestCostObject ? `${formatMoney(latestSavedCost.materialCostPerUnit)} / ${latestCostObject.unit}` : '暂无'} hint={`${data.costObjects.length} 个加工成本对象`} />
            <DashboardStat label="当前库存单价" value={`${formatMoney(stock?.stockUnitCost)} / ${data.material.stockUnit}`} hint={`库存金额 ${formatMoney(stock?.totalCost)}`} wide />
          </div>
        </section>
      </aside>

      <section className="min-w-0 space-y-2" data-panorama-details>
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-0.5">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">明细</h2>
            <p className="mt-0.5 text-xs text-gray-500">一次展开一组；选择其他明细时自动切换。</p>
          </div>
          {activeSectionId && (
            <button type="button" onClick={() => setActiveSectionId(null)} className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              收起当前
            </button>
          )}
        </div>
        {visibleModules.length === 0 && <div className="rounded-lg border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">当前没有可显示的明细，请在“布局”中恢复模块。</div>}
        <div className="space-y-2">
          {visibleModules.map((module) => (
            <DisclosureSection key={module.id} id={module.id} summary={sectionSummary(module.id, data, relatedRoutes)} expanded={activeSectionId === module.id} onToggle={() => toggleSection(module.id)}>
              {contents[module.id]}
            </DisclosureSection>
          ))}
        </div>
      </section>
    </SplitWorkspace>
  )
}
