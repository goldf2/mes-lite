'use client'

import type { Material } from '../contracts'
import type { MaterialBomSummary, MaterialCollectionActions, MaterialVisibleField } from '../model/material-view'
import { materialCategoryLabels } from '../model/material-options'

export default function MaterialCardView({
  materials,
  visibleFields,
  showBomSummary,
  canCreateBom,
  getBomSummary,
  actions,
}: {
  materials: Material[]
  visibleFields: MaterialVisibleField[]
  showBomSummary: boolean
  canCreateBom: boolean
  getBomSummary: (material: Material) => MaterialBomSummary
  actions: MaterialCollectionActions
}) {
  const showField = (field: MaterialVisibleField) => visibleFields.includes(field)

  return (
    <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {materials.map((material) => {
        const bomSummary = showBomSummary ? getBomSummary(material) : null
        return (
          <article key={material.id} className="group flex min-h-[218px] flex-col rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition hover:border-blue-300 hover:shadow-sm sm:shadow-none">
            <div className="flex min-w-0 gap-3">
              {showField('image') && (
                <button
                  type="button"
                  onClick={() => actions.onViewDetail(material)}
                  className="h-12 w-12 shrink-0 overflow-hidden rounded border border-gray-200 bg-gray-50"
                  title={material.primaryImage?.note || '查看物料详情'}
                >
                  {material.primaryImage ? (
                    <img src={material.primaryImage.thumbnailUrl || material.primaryImage.url} alt={material.primaryImage.note || material.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xs text-gray-400">暂无</span>
                  )}
                </button>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  {showField('code') && <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-blue-700" title={material.code}>{material.code}</span>}
                  {showField('category') && <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{materialCategoryLabels[material.category || 'RAW'] || '其他'}</span>}
                </div>
                <div className="mt-1 line-clamp-1 text-sm font-semibold text-gray-900" title={material.name}>{material.name}</div>
                {showField('spec') && <div className="mt-0.5 truncate text-sm text-gray-500">{material.spec || '无规格'}</div>}
                {showField('note') && material.note && <div className="mt-0.5 line-clamp-2 text-xs text-gray-500">备注：{material.note}</div>}
                {showField('customer') && <div className="mt-0.5 truncate text-xs text-gray-500">客户：{material.customer?.name || '通用/未绑定'}</div>}
              </div>
            </div>

            {(showField('stock') || showField('valuationStock')) && (
              <div className="mt-3 grid grid-cols-2 gap-x-3 border-t border-gray-100 pt-2 text-sm">
                {showField('stock') && (
                  <div className="min-w-0">
                    <div className="text-xs text-gray-500">库存</div>
                    <div className="mt-0.5 truncate font-semibold text-gray-900">{material.stock?.qty || 0} {material.stockUnit || material.unit}</div>
                  </div>
                )}
                {showField('valuationStock') && (
                  <div className="min-w-0">
                    <div className="text-xs text-gray-500">参考数量</div>
                    <div className="mt-0.5 truncate font-semibold text-emerald-700">{material.stock?.valuationQty || 0} {material.valuationUnit || material.unit}</div>
                  </div>
                )}
              </div>
            )}

            {(showField('valuationUnit') || showField('createdAt')) && (
              <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-gray-500">
                {showField('valuationUnit') && <span className="min-w-0 flex-1 truncate">1 {material.stockUnit || material.unit} = {material.conversionRate || 1} {material.valuationUnit || material.unit}</span>}
                {showField('valuationUnit') && <span className="whitespace-nowrap">{material.costingMethod === 'FIFO' ? 'FIFO' : '移动加权'}</span>}
                {showField('createdAt') && <span className="whitespace-nowrap">{new Date(material.createdAt).toLocaleDateString('zh-CN')}</span>}
              </div>
            )}

            {bomSummary && (
              <div className={`mt-2 overflow-hidden rounded border-l-2 px-2 py-1.5 text-xs ${bomSummary.count > 0 ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-gray-300 bg-gray-50 text-gray-500'}`}>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="shrink-0 font-medium">BOM</span>
                  <span className="min-w-0 truncate">组成 {bomSummary.componentCount} · 被引用 {bomSummary.usageCount}</span>
                </div>
                <div className="mt-0.5 truncate" title={bomSummary.text}>{bomSummary.text}</div>
              </div>
            )}

            <div className="mt-auto flex items-center justify-end gap-1.5 pt-3">
              {canCreateBom && (
                <button type="button" onClick={() => actions.onCreateBom(material.id)} className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 transition hover:bg-emerald-50">
                  创建 BOM
                </button>
              )}
              <button type="button" onClick={() => actions.onOpenPanorama(material)} className="rounded border border-blue-200 px-2 py-1 text-xs text-blue-700 transition hover:bg-blue-50">
                全景
              </button>
              <button type="button" onClick={() => actions.onViewDetail(material)} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 transition hover:bg-gray-50">
                详情
              </button>
              <button type="button" onClick={() => actions.onArchive(material.id)} className="rounded border border-amber-200 px-2 py-1 text-xs text-amber-700 transition hover:bg-amber-50">
                归档
              </button>
            </div>
          </article>
        )
      })}
    </div>
  )
}
