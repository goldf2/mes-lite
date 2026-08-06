'use client'

import { ReactNode } from 'react'
import RelationSearch from './RelationSearch'

export interface MaterialRelationOption {
  id: string
  code: string
  name: string
  spec?: string | null
  category?: string
  unit?: string
  stockUnit?: string
  primaryImage?: { url: string; thumbnailUrl?: string; note?: string | null } | null
}

export function MaterialRelationSearch({
  materials,
  disabledIds = [],
  onAdd,
  placeholder = '输入物料编码、名称或规格筛选',
}: {
  materials: MaterialRelationOption[]
  disabledIds?: string[]
  onAdd: (materialId: string) => void
  placeholder?: string
}) {
  return (
    <RelationSearch
      items={materials}
      getKey={(material) => material.id}
      getLabel={(material) => `${material.code} · ${material.name}${material.spec ? ` · ${material.spec}` : ''}`}
      getKeywords={(material) => `${material.code} ${material.name} ${material.spec || ''} ${material.category || ''}`}
      disabledIds={disabledIds}
      onSelect={(material) => onAdd(material.id)}
      placeholder={placeholder}
      emptyText="没有匹配物料"
      renderOption={(material) => (
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 truncate">
            <span className="font-mono text-xs text-gray-500">{material.code}</span>
            <span className="ml-2">{material.name}</span>
            {material.spec && <span className="ml-2 text-xs text-gray-500">{material.spec}</span>}
          </span>
          {(material.stockUnit || material.unit) && (
            <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{material.stockUnit || material.unit}</span>
          )}
        </div>
      )}
    />
  )
}

export function MaterialRelationIdentity({
  material,
  fallbackId,
  badge,
  onPreview,
}: {
  material?: MaterialRelationOption
  fallbackId: string
  badge?: ReactNode
  onPreview?: (material: MaterialRelationOption) => void
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {material?.primaryImage ? (
        <button
          type="button"
          onClick={() => onPreview?.(material)}
          disabled={!onPreview}
          title={onPreview ? '放大查看物料图片' : undefined}
          aria-label={onPreview ? `放大查看${material.name}图片` : undefined}
          className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-default disabled:hover:border-gray-200"
        >
          {/* Attachment URLs can be local or authenticated and are already thumbnail-optimized. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={material.primaryImage.thumbnailUrl || material.primaryImage.url} alt={material.primaryImage.note || material.name} className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-[10px] text-gray-400">无图</div>
      )}
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-900">{material?.name || '未知物料'}</span>
          {badge}
        </div>
        <div className="truncate text-xs text-gray-500">{material?.code || fallbackId}{material?.spec ? ` · ${material.spec}` : ''}</div>
      </div>
    </div>
  )
}
