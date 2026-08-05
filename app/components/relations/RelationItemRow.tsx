'use client'

import { ReactNode } from 'react'

export default function RelationItemRow({
  identity,
  fields,
  onRemove,
  removeLabel = '移除',
}: {
  identity: ReactNode
  fields?: ReactNode
  onRemove: () => void
  removeLabel?: string
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(10rem,1fr)_auto] items-center gap-2 py-3 2xl:grid-cols-[minmax(0,1fr)_minmax(10rem,12rem)_auto]">
      <div className="col-span-2 min-w-0 2xl:col-span-1">{identity}</div>
      {fields && <div className="min-w-0">{fields}</div>}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-md px-2 py-2 text-xs text-red-600 hover:bg-red-50"
      >
        {removeLabel}
      </button>
    </div>
  )
}
