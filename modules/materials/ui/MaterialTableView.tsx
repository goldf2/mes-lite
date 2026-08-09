'use client'

import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { Material } from '../contracts'
import type {
  MaterialBomSummary,
  MaterialCollectionActions,
  MaterialColumnControls,
  MaterialSortBy,
  MaterialTableColumnKey,
  MaterialVisibleField,
  SortDirection,
} from '../model/material-view'
import { materialCategoryLabels } from '../model/material-options'

function ColumnResizeHandle({
  label,
  onPointerDown,
  onReset,
  onNudge,
}: {
  label: string
  onPointerDown: (event: ReactPointerEvent<HTMLSpanElement>) => void
  onReset: () => void
  onNudge: (delta: number) => void
}) {
  return (
    <span
      role="separator"
      aria-label={`调整${label}列宽`}
      aria-orientation="vertical"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onReset()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        event.stopPropagation()
        onNudge(event.key === 'ArrowRight' ? 12 : -12)
      }}
      title="拖动调整列宽，双击恢复自动列宽"
      className="absolute -right-1 top-0 z-10 flex h-full w-3 cursor-col-resize touch-none items-center justify-center outline-none before:h-5 before:w-px before:bg-gray-300 hover:before:bg-blue-500 focus:before:bg-blue-500"
    />
  )
}

function MaterialTableHeader({
  columnKey,
  label,
  style,
  columns,
}: {
  columnKey: MaterialTableColumnKey
  label: string
  style?: CSSProperties
  columns: MaterialColumnControls
}) {
  return (
    <th scope="col" style={style} className="relative whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-gray-600">
      {label}
      <ColumnResizeHandle
        label={label}
        onPointerDown={(event) => columns.onResize(columnKey, event)}
        onReset={() => columns.onReset(columnKey)}
        onNudge={(delta) => columns.onNudge(columnKey, delta)}
      />
    </th>
  )
}

function MaterialSortableHeader({
  columnKey,
  field,
  label,
  sortBy,
  sortDir,
  style,
  onSort,
  columns,
}: {
  columnKey: MaterialTableColumnKey
  field: MaterialSortBy
  label: string
  sortBy: MaterialSortBy
  sortDir: SortDirection
  style?: CSSProperties
  onSort: (field: MaterialSortBy) => void
  columns: MaterialColumnControls
}) {
  const active = sortBy === field
  return (
    <th scope="col" aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={style} className="relative whitespace-nowrap px-4 py-3 text-left text-sm font-semibold">
      <button type="button" onClick={() => onSort(field)} className={`group flex w-full items-center gap-1 text-left transition ${active ? 'text-blue-700' : 'text-gray-600 hover:text-blue-700'}`} title={`按${label}${active && sortDir === 'asc' ? '降序' : '升序'}排列`}>
        <span>{label}</span>
        <span aria-hidden="true" className={`text-xs ${active ? 'text-blue-600' : 'text-gray-300 group-hover:text-blue-400'}`}>
          {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
      <ColumnResizeHandle
        label={label}
        onPointerDown={(event) => columns.onResize(columnKey, event)}
        onReset={() => columns.onReset(columnKey)}
        onNudge={(delta) => columns.onNudge(columnKey, delta)}
      />
    </th>
  )
}

export default function MaterialTableView({
  materials,
  visibleFields,
  showBomSummary,
  canCreateBom,
  getBomSummary,
  sortBy,
  sortDir,
  onSort,
  columns,
  actions,
}: {
  materials: Material[]
  visibleFields: MaterialVisibleField[]
  showBomSummary: boolean
  canCreateBom: boolean
  getBomSummary: (material: Material) => MaterialBomSummary
  sortBy: MaterialSortBy
  sortDir: SortDirection
  onSort: (field: MaterialSortBy) => void
  columns: MaterialColumnControls
  actions: MaterialCollectionActions
}) {
  const showField = (field: MaterialVisibleField) => visibleFields.includes(field)
  const sortableHeader = (columnKey: MaterialTableColumnKey, field: MaterialSortBy, label: string) => (
    <MaterialSortableHeader
      columnKey={columnKey}
      field={field}
      label={label}
      sortBy={sortBy}
      sortDir={sortDir}
      style={columns.styleFor(columnKey)}
      onSort={onSort}
      columns={columns}
    />
  )

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100">
      <table className="min-w-full table-auto">
        <thead className="bg-gray-50">
          <tr>
            {showField('image') && <MaterialTableHeader columnKey="image" label="图片" style={columns.styleFor('image')} columns={columns} />}
            {showField('code') && sortableHeader('code', 'code', '物料编码')}
            {sortableHeader('name', 'name', '物料名称')}
            {showField('category') && sortableHeader('category', 'category', '分类')}
            {showField('customer') && sortableHeader('customer', 'customer', '归属客户')}
            {showField('spec') && sortableHeader('spec', 'spec', '规格')}
            {showField('note') && sortableHeader('note', 'note', '备注')}
            {showField('stockUnit') && sortableHeader('stockUnit', 'stockUnit', '库存单位')}
            {showField('valuationUnit') && sortableHeader('valuationUnit', 'valuationUnit', '参考/计价单位')}
            {showField('stock') && sortableHeader('stock', 'stock', '库存')}
            {showField('valuationStock') && sortableHeader('valuationStock', 'valuationStock', '参考数量')}
            {showField('createdAt') && sortableHeader('createdAt', 'createdAt', '创建时间')}
            {showBomSummary && sortableHeader('bomSummary', 'bomSummary', 'BOM 简况')}
            <MaterialTableHeader columnKey="actions" label="操作" style={columns.styleFor('actions')} columns={columns} />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {materials.map((material) => {
            const bomSummary = showBomSummary ? getBomSummary(material) : null
            return (
              <tr key={material.id} className="align-top transition hover:bg-gray-50">
                {showField('image') && (
                  <td style={columns.styleFor('image')} className="overflow-hidden px-4 py-3">
                    <button type="button" onClick={() => actions.onViewDetail(material)} className="h-12 w-12 overflow-hidden rounded border border-gray-200 bg-gray-50" title={material.primaryImage?.note || '查看物料详情'}>
                      {material.primaryImage ? (
                        <img src={material.primaryImage.thumbnailUrl || material.primaryImage.url} alt={material.primaryImage.note || material.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs text-gray-400">暂无</span>
                      )}
                    </button>
                  </td>
                )}
                {showField('code') && <td style={columns.styleFor('code')} className="overflow-hidden px-4 py-3 font-mono text-sm text-blue-600"><div className="truncate" title={material.code}>{material.code}</div></td>}
                <td style={columns.styleFor('name')} className="overflow-hidden px-4 py-3 text-sm font-medium"><div className="truncate" title={material.name}>{material.name}</div></td>
                {showField('category') && <td style={columns.styleFor('category')} className="overflow-hidden px-4 py-3 text-sm"><div className="truncate">{materialCategoryLabels[material.category || 'RAW'] || '其他'}</div></td>}
                {showField('customer') && <td style={columns.styleFor('customer')} className="overflow-hidden px-4 py-3 text-sm"><div className="truncate" title={material.customer?.name || '通用/未绑定'}>{material.customer?.name || '通用/未绑定'}</div></td>}
                {showField('spec') && <td style={columns.styleFor('spec')} className="overflow-hidden px-4 py-3 text-sm text-gray-500"><div className="truncate" title={material.spec || '-'}>{material.spec || '-'}</div></td>}
                {showField('note') && <td style={columns.styleFor('note')} className="overflow-hidden px-4 py-3 text-sm text-gray-500"><div className="line-clamp-2" title={material.note || '-'}>{material.note || '-'}</div></td>}
                {showField('stockUnit') && <td style={columns.styleFor('stockUnit')} className="overflow-hidden px-4 py-3 text-sm"><div className="truncate">{material.stockUnit || material.unit}</div></td>}
                {showField('valuationUnit') && (
                  <td style={columns.styleFor('valuationUnit')} className="overflow-hidden px-4 py-3 text-sm">
                    <div className="truncate">{material.valuationUnit || material.unit}</div>
                    <div className="truncate text-xs text-gray-500">1 {material.stockUnit || material.unit} = {material.conversionRate || 1} {material.valuationUnit || material.unit}</div>
                    <div className="truncate text-xs text-gray-500">成本法：{material.costingMethod === 'FIFO' ? '先入先出' : '移动加权平均'}</div>
                  </td>
                )}
                {showField('stock') && <td style={columns.styleFor('stock')} className="overflow-hidden px-4 py-3 text-sm"><div className="truncate">{material.stock?.qty || 0} {material.stockUnit || material.unit}</div></td>}
                {showField('valuationStock') && <td style={columns.styleFor('valuationStock')} className="overflow-hidden px-4 py-3 text-sm text-green-600"><div className="truncate">{material.stock?.valuationQty || 0} {material.valuationUnit || material.unit}</div></td>}
                {showField('createdAt') && <td style={columns.styleFor('createdAt')} className="overflow-hidden px-4 py-3 text-xs text-gray-500"><div className="truncate">{new Date(material.createdAt).toLocaleString('zh-CN')}</div></td>}
                {bomSummary && (
                  <td style={columns.styleFor('bomSummary')} className="overflow-hidden px-4 py-3 text-sm">
                    <div className={`overflow-hidden rounded-lg border px-2 py-1.5 text-xs ${bomSummary.count > 0 ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-gray-100 bg-gray-50 text-gray-500'}`}>
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <span className="shrink-0 font-medium">BOM</span>
                        <span className="min-w-0 truncate">组成 {bomSummary.componentCount} · 被引用 {bomSummary.usageCount}</span>
                      </div>
                      <div className="mt-1 truncate" title={bomSummary.text}>{bomSummary.text}</div>
                    </div>
                  </td>
                )}
                <td style={columns.styleFor('actions')} className="overflow-hidden whitespace-nowrap px-4 py-3">
                  {canCreateBom && (
                    <button type="button" onClick={() => actions.onCreateBom(material.id)} className="mr-2 rounded border border-emerald-300 px-3 py-1 text-xs text-emerald-700 transition hover:bg-emerald-50">
                      创建 BOM
                    </button>
                  )}
                  <button type="button" onClick={() => actions.onOpenPanorama(material)} className="rounded border border-blue-300 px-3 py-1 text-xs text-blue-700 transition hover:bg-blue-50">全景</button>
                  <button type="button" onClick={() => actions.onViewDetail(material)} className="ml-2 rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 transition hover:bg-gray-50">查看详情</button>
                  <button type="button" onClick={() => actions.onArchive(material.id)} className="ml-2 rounded border border-amber-300 px-3 py-1 text-xs text-amber-700 transition hover:bg-amber-50">归档</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
