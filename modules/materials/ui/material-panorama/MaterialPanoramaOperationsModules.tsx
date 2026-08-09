'use client'

import type { PanoramaData, ProcessRouteSummary } from '../../contracts/material-panorama'
import { compactDate, formatMoney, formatNumber, processCostPerThousand, statusText } from '../../model/material-panorama-view'
import { EmptyText, Metric, Panel, ProcessRouteList, ProcessTemplateList } from './MaterialPanoramaPrimitives'

export function MaterialPanoramaBomProcessModule({ data, relatedRoutes }: { data: PanoramaData; relatedRoutes: ProcessRouteSummary[] }) {
  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
      <Panel title="相关 BOM" action={`作为目标物料 ${data.productBoms.length} 个，作为用料 ${data.componentBoms.length} 个`}>
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xs font-medium text-gray-500">该物料对应 BOM</div>
            {data.productBoms.length === 0 ? <EmptyText>未找到与物料编码直接对应的 BOM</EmptyText> : (
              <div className="space-y-2">
                {data.productBoms.map((bom) => (
                  <div key={bom.id} className="rounded-md border border-gray-100 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div><div className="font-medium text-gray-900">{bom.product.name}</div><div className="mt-0.5 font-mono text-xs text-blue-700">{bom.product.sku} · {bom.version}</div></div>
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{bom.isActive ? '启用' : '停用'}</span>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-gray-600">
                      {bom.items.slice(0, 6).map((item) => (
                        <div key={item.id} className="flex min-w-0 justify-between gap-2">
                          <span className="truncate">{item.material ? `${item.material.code} · ${item.material.name}` : item.costObject ? `${item.costObject.code} · ${item.costObject.name}` : item.sawingScenario?.name || item.itemType || 'BOM项'}</span>
                          <span className="shrink-0">{item.material ? (item.quantity > 0 ? `每批投入 ${formatNumber(item.quantity, 6)} ${item.unit}` : '待填写每批投入数量') : `${formatNumber(item.quantity, 6)} ${item.unit}`}</span>
                        </div>
                      ))}
                    </div>
                    {bom.latestCostRun && <div className="mt-2 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">最新 BOM 单位成本 {formatMoney(bom.latestCostRun.unitCost)} / {bom.product.unit}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-gray-500">哪些 BOM 使用了该物料</div>
            {data.componentBoms.length === 0 ? <EmptyText>暂无 BOM 使用此物料</EmptyText> : (
              <div className="space-y-2">
                {data.componentBoms.map((item) => (
                  <div key={item.id} className="rounded-md border border-gray-100 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div><div className="font-medium text-gray-900">{item.bom.product.name}</div><div className="mt-0.5 font-mono text-xs text-blue-700">{item.bom.product.sku} · {item.bom.version}</div></div>
                      <div className={`rounded px-2 py-1 text-xs ${item.quantity > 0 ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{item.quantity > 0 ? `每批投入 ${formatNumber(item.quantity, 6)} ${item.unit}` : '待填写每批投入数量'}</div>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">实际耗用在生产订单班后实绩中按主库存单位记录</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Panel>
      <Panel title="加工工艺/作业步骤" action={`${data.processTemplates.length} 个工艺 · ${relatedRoutes.length} 条路线`}>
        <div className="space-y-4">
          <div><div className="mb-2 text-xs font-medium text-gray-500">物料直接关联的加工工艺</div><ProcessTemplateList templates={data.processTemplates} /></div>
          <div><div className="mb-2 text-xs font-medium text-gray-500">BOM 推导的工艺路线</div><ProcessRouteList routes={relatedRoutes} /></div>
        </div>
      </Panel>
    </div>
  )
}

export function MaterialPanoramaCostingModule({ data, relatedRoutes }: { data: PanoramaData; relatedRoutes: ProcessRouteSummary[] }) {
  const relatedRouteCost = relatedRoutes.flatMap((route) => route.steps).reduce((sum, step) => {
    const totals = processCostPerThousand(step)
    return { laborHours: sum.laborHours + totals.laborHours, machineHours: sum.machineHours + totals.machineHours, cost: sum.cost + totals.cost }
  }, { laborHours: 0, machineHours: 0, cost: 0 })
  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
      <Panel title="加工参数与成本对象" action={`${data.costObjects.length} 个成本对象`}>
        <div className="grid grid-cols-3 gap-2">
          <Metric label="千件人工" value={`${formatNumber(relatedRouteCost.laborHours, 2)} h`} tone="blue" />
          <Metric label="千件机时" value={`${formatNumber(relatedRouteCost.machineHours, 2)} h`} tone="amber" />
          <Metric label="路线成本" value={formatMoney(relatedRouteCost.cost)} tone="green" />
        </div>
        <div className="mt-4 space-y-2">
          {data.costObjects.length === 0 ? <EmptyText>暂无直接或 BOM 推导的成本对象</EmptyText> : data.costObjects.map((costObject) => {
            const activeCost = costObject.costs[0]
            return (
              <div key={costObject.id} className="rounded-md border border-gray-100 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-medium text-gray-900">{costObject.name}</div><div className="mt-0.5 font-mono text-xs text-blue-700">{costObject.code} · {costObject.objectType}</div></div><span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{costObject.unit}</span></div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600 sm:grid-cols-4"><span>材料 {formatMoney(activeCost?.materialCostPerUnit)}</span><span>人工 {formatNumber(activeCost?.laborHoursPerUnit, 4)}h</span><span>机时 {formatNumber(activeCost?.machineHoursPerUnit, 4)}h</span><span>直接费 {formatMoney(activeCost?.directCostPerUnit)}</span></div>
                <div className="mt-1 text-xs text-gray-500">BOM 使用：{costObject.bomItems.length ? costObject.bomItems.map((item) => item.bom.product.sku).join('、') : '暂无'}</div>
              </div>
            )
          })}
        </div>
      </Panel>
      <Panel title="物料成本快照" action={`${data.productBoms.filter((bom) => bom.latestCostRun).length} 个物料有成本`}>
        {data.productBoms.length === 0 ? <EmptyText>暂无与该物料对应的 BOM</EmptyText> : (
          <div className="space-y-2">{data.productBoms.map((bom) => (
            <div key={bom.id} className="rounded-md border border-gray-100 px-3 py-2"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-medium text-gray-900">{bom.product.name}</div><div className="mt-0.5 font-mono text-xs text-blue-700">{bom.product.sku} · {bom.version}</div></div><div className="text-right text-xs">{bom.latestCostRun ? <><div className="font-semibold text-blue-700">{formatMoney(bom.latestCostRun.unitCost)} / {bom.product.unit}</div><div className="mt-0.5 text-gray-500">{compactDate(bom.latestCostRun.createdAt)}</div></> : <span className="text-gray-500">暂无成本快照</span>}</div></div></div>
          ))}</div>
        )}
      </Panel>
    </div>
  )
}

export function MaterialPanoramaOrdersModule({ data }: { data: PanoramaData }) {
  return (
    <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
      <Panel title="相关工单" action={`目标工单 ${data.targetOrders.length} 个`}>
        {data.targetOrders.length === 0 ? <EmptyText>暂无以该物料为目标的工单</EmptyText> : (
          <div className="space-y-2">{data.targetOrders.map((order) => (
            <div key={order.id} className="rounded-md border border-gray-100 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-mono text-sm font-semibold text-blue-700">{order.orderNo}</div><div className="mt-0.5 text-xs text-gray-500">{order.voucherNo ? `凭据号 ${order.voucherNo}` : '无凭据号'} · {compactDate(order.createdAt)}</div></div><span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{statusText(order.status)}</span></div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-600"><span>计划 {formatNumber(order.planQty, 0)}</span><span>完成 {formatNumber(order.completeQty, 0)}</span><span>报废 {formatNumber(order.scrapQty, 0)}</span></div>
              {order._count && <div className="mt-1 text-xs text-gray-500">领料 {order._count.picks} · 报工 {order._count.reports} · 派工 {order._count.dispatches} · 入库 {order._count.stockIns}</div>}
            </div>
          ))}</div>
        )}
      </Panel>
      <Panel title="作为用料的领料记录" action={`${data.consumingPicks.length} 条`}>
        {data.consumingPicks.length === 0 ? <EmptyText>暂无领料消耗记录</EmptyText> : (
          <div className="space-y-2">{data.consumingPicks.map((pick) => (
            <div key={pick.id} className="rounded-md border border-gray-100 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-mono text-sm font-semibold text-blue-700">{pick.order.orderNo}</div><div className="mt-0.5 text-xs text-gray-500">{pick.order.targetMaterial?.name || pick.order.product.name}</div></div><span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{statusText(pick.status)}</span></div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600 sm:grid-cols-4"><span>需求 {formatNumber(pick.requiredQty)}</span><span>实领 {formatNumber(pick.actualQty)}</span><span>核算 {formatNumber(pick.actualValuationQty)}</span><span>成本 {formatMoney(pick.costAmount)}</span></div>
            </div>
          ))}</div>
        )}
      </Panel>
    </div>
  )
}
