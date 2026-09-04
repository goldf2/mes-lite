'use client'

import { DocumentPreviewThumb } from '@/modules/attachments'
import type { AttachmentItem, PanoramaData, WorkInstructionSummary } from '../../contracts/material-panorama'
import { documentCategoryText, formatDate, formatMoney, formatNumber, materialCategoryLabels, statusText } from '../../model/material-panorama-view'
import { AttachmentList, EmptyText, Metric, Panel } from './MaterialPanoramaPrimitives'

export function MaterialPanoramaSummaryModule({ data, coverImage }: { data: PanoramaData; coverImage?: AttachmentItem }) {
  const { material, stock } = data
  return (
    <div className="grid grid-cols-1 items-start gap-3 2xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
      <Panel title="物料档案">
        <div className="grid gap-4 md:grid-cols-[160px_minmax(0,1fr)]">
          <a href={coverImage?.originalUrl || coverImage?.url} target={coverImage ? '_blank' : undefined} rel={coverImage ? 'noreferrer' : undefined} className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-gray-100">
            {coverImage ? <img src={coverImage.thumbnailUrl || coverImage.url} alt={coverImage.note || material.name} className="h-full w-full object-contain" /> : <span className="text-sm text-gray-400">暂无图片</span>}
          </a>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-blue-50 px-2 py-1 font-mono text-xs text-blue-700">{material.code}</span>
              <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{materialCategoryLabels[material.category] || material.category}</span>
              <span className="rounded bg-green-50 px-2 py-1 text-xs text-green-700">{material.costingMethod === 'FIFO' ? 'FIFO' : '移动加权'}</span>
            </div>
            <h2 className="mt-2 text-xl font-semibold text-gray-900">{material.name}</h2>
            <div className="mt-2 grid gap-x-4 gap-y-1.5 text-sm text-gray-600 sm:grid-cols-2">
              <div>规格：{material.spec || '-'}</div><div>客户：{material.customer?.name || '通用/未绑定'}</div>
              <div>库存单位：{material.stockUnit || material.unit}</div><div>核算单位：{material.valuationUnit}</div>
              <div className="sm:col-span-2">换算：1 {material.stockUnit || material.unit} = {formatNumber(material.conversionRate, 6)} {material.valuationUnit}</div>
              <div className="sm:col-span-2">创建时间：{formatDate(material.createdAt)}</div>
            </div>
            {material.note && <div className="mt-3 whitespace-pre-wrap rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">备注：{material.note}</div>}
          </div>
        </div>
      </Panel>
      <Panel title="库存总览" action={stock ? '实时余额' : '缺少库存记录'}>
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
          <Metric label="当前库存" value={`${formatNumber(stock?.qty)} ${material.stockUnit || material.unit}`} />
          <Metric label="可用库存" value={`${formatNumber(stock?.availableQty)} ${material.stockUnit || material.unit}`} tone="green" />
          <Metric label="已占用" value={`${formatNumber(stock?.reservedQty)} ${material.stockUnit || material.unit}`} tone="amber" />
          <Metric label="待检库存" value={`${formatNumber(stock?.quarantineQty)} ${material.stockUnit || material.unit}`} tone="amber" />
          <Metric label="冻结库存" value={`${formatNumber(stock?.holdQty)} ${material.stockUnit || material.unit}`} />
          <Metric label="核算库存" value={`${formatNumber(stock?.valuationQty)} ${material.valuationUnit}`} />
          <Metric label="库存金额" value={formatMoney(stock?.totalCost)} tone="blue" />
          <Metric label="当前单价" value={`${formatMoney(stock?.stockUnitCost)} / ${material.stockUnit || material.unit}`} hint={`${formatMoney(stock?.valuationUnitCost)} / ${material.valuationUnit}`} />
        </div>
      </Panel>
    </div>
  )
}

export function MaterialPanoramaDocumentsModule({ data, onOpenInstruction }: { data: PanoramaData; onOpenInstruction: (instruction: WorkInstructionSummary) => void }) {
  const { material } = data
  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]">
      <Panel title="库位分布" action="实物数量按库位">
        {data.locationBalances.length === 0 ? <EmptyText>暂无库存余额记录</EmptyText> : (
          <div className="space-y-2">
            {data.locationBalances.map((location) => (
              <div key={location.id} className="rounded-md border border-gray-100 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><div className="font-medium text-gray-900">{location.locationName}</div><div className="mt-0.5 text-xs text-gray-500">{location.locationCode}</div></div>
                  <div className="text-right"><div className="font-semibold text-gray-900">{formatNumber(location.qty)} {material.stockUnit || material.unit}</div><div className="text-xs text-green-700">可用 {formatNumber(location.availableQty)} {material.stockUnit || material.unit}</div></div>
                </div>
                <div className="mt-2 text-xs text-gray-500">占用 {formatNumber(location.reservedQty)} · 待检 {formatNumber(location.quarantineQty)} · 冻结 {formatNumber(location.holdQty)} {material.stockUnit || material.unit}；成本仍按物料总库存统一核算</div>
                {location.note && <div className="mt-1 text-xs text-gray-500">{location.note}</div>}
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="产品文档与相关附件" action={`${data.workInstructions.length} 条产品文档`}>
        <div className="space-y-3">
          <div>
            <div className="mb-2 text-xs font-medium text-gray-500">正式产品文档</div>
            {data.workInstructions.length === 0 ? <EmptyText>暂无直接关联到该产品的文档</EmptyText> : (
              <div className="space-y-2">
                {data.workInstructions.map((instruction) => {
                  const previewAttachment = instruction.attachments.find((attachment) => attachment.mimeType.startsWith('image/')) || instruction.attachments[0]
                  return (
                    <div key={instruction.id} className="flex items-start gap-3 rounded-md border border-gray-100 px-3 py-2">
                      <button type="button" onClick={() => onOpenInstruction(instruction)} disabled={!previewAttachment} className="w-24 shrink-0 text-left disabled:cursor-not-allowed"><DocumentPreviewThumb attachment={previewAttachment} title={instruction.material.name} /></button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0"><div className="truncate text-sm font-medium text-gray-900">{instruction.material.name}</div><div className="mt-0.5 font-mono text-xs text-blue-700">{instruction.material.code} · {instruction.version}</div></div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{documentCategoryText(instruction.category)}</span>
                            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{statusText(instruction.status)}</span>
                            <button type="button" onClick={() => onOpenInstruction(instruction)} disabled={!previewAttachment} className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500">全屏打开</button>
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">客户：{instruction.material.customer?.name || '通用产品'} · 文件：{instruction.imageCount} 图 / {instruction.pdfCount} PDF</div>
                        <div className="mt-1 line-clamp-2 text-xs text-gray-500">工作中心：{instruction.workCenters.length > 0 ? instruction.workCenters.map((item) => item.name).join('、') : '不限'}</div>
                        {instruction.note && <div className="mt-1 line-clamp-2 text-xs text-gray-500">备注：{instruction.note}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div><div className="mb-2 text-xs font-medium text-gray-500">物料旧附件文档</div><AttachmentList items={data.attachments.documents.filter((item) => !data.attachments.workInstructions.some((doc) => doc.id === item.id))} /></div>
        </div>
      </Panel>
    </div>
  )
}
