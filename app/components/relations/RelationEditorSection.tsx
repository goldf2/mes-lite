'use client'

import { ReactNode } from 'react'

export default function RelationEditorSection({
  title,
  count,
  selector,
  emptyText,
  children,
}: {
  title: ReactNode
  count: number
  selector: ReactNode
  emptyText: ReactNode
  children: ReactNode
}) {
  return (
    <section className="min-w-0 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        <span className="text-xs text-gray-500">{count} 项</span>
      </div>
      {selector}
      <div className="mt-3 divide-y divide-gray-100">
        {count === 0 ? <div className="py-8 text-center text-sm text-gray-400">{emptyText}</div> : children}
      </div>
    </section>
  )
}
