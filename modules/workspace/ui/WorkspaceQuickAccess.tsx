'use client'

import { useMemo } from 'react'
import { ExternalLink } from 'lucide-react'
import AppButton from '@/app/components/AppButton'
import type { WorkspaceFunctionKey, WorkspacePreferenceValue } from '@/lib/workspace'
import { WorkspaceFunctionCardGrid, type WorkspaceFunctionItem } from './WorkspaceFunctionCatalog'
import SharedQuickAccessPanel from './SharedQuickAccessPanel'

const QUICK_TOOL_KEYS: WorkspaceFunctionKey[] = ['scanPrint', 'sawingCost', 'helpCenter', 'warehouseDigitalTwin']

export default function WorkspaceQuickAccess({ items, preference, saving, error, onOpen, onToggleFavorite, includeTools = false }: {
  items: WorkspaceFunctionItem[]
  preference: WorkspacePreferenceValue
  saving: boolean
  error?: string
  onOpen: (key: WorkspaceFunctionKey) => void
  onToggleFavorite: (key: WorkspaceFunctionKey) => void
  includeTools?: boolean
}) {
  const itemByKey = useMemo(() => new Map(items.map((item) => [item.key, item])), [items])
  const favoriteItems = useMemo(() => preference.pinned.flatMap((key) => {
    const item = itemByKey.get(key)
    return item ? [item] : []
  }), [itemByKey, preference.pinned])
  const frequentItems = useMemo(() => [...preference.usage]
    .sort((a, b) => b.useCount - a.useCount || (b.lastUsedAt || '').localeCompare(a.lastUsedAt || ''))
    .flatMap((entry) => {
      const item = itemByKey.get(entry.functionKey)
      return item ? [{ item, useCount: entry.useCount }] : []
    })
    .slice(0, 5), [itemByKey, preference.usage])
  const toolItems = includeTools ? QUICK_TOOL_KEYS.flatMap((key) => {
    const item = itemByKey.get(key)
    return item ? [item] : []
  }) : []

  return (
    <SharedQuickAccessPanel count={favoriteItems.length}>
      {(close) => {
        const open = (key: WorkspaceFunctionKey) => {
          close()
          onOpen(key)
        }
        return (
          <div aria-label="个人常用与高频访问" className="min-w-0 space-y-4">
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <section aria-label="我的收藏" className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-900">我的常用</h2>
                <span className="text-xs text-gray-500">{favoriteItems.length} 项</span>
              </div>
              {favoriteItems.length > 0 ? (
                <WorkspaceFunctionCardGrid
                  items={favoriteItems}
                  preference={preference}
                  saving={saving}
                  onOpen={open}
                  onToggleFavorite={onToggleFavorite}
                  compact
                  showDescription={false}
                  columnsClassName="grid grid-cols-1 gap-2"
                />
              ) : <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-3 text-sm text-gray-500">点击功能旁的星标，即可添加到我的常用。</p>}
            </section>

            <section aria-label="高频访问" className="space-y-2 border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-900">高频访问</h2>
                <span className="text-xs text-gray-500">按使用次数排序</span>
              </div>
              {frequentItems.length > 0 ? (
                <div className="space-y-1">
                  {frequentItems.map(({ item, useCount }) => (
                    <AppButton
                      key={item.key}
                      variant="ghost"
                      onClick={() => open(item.key)}
                      aria-label={`打开高频功能${item.label}`}
                      className="!h-auto min-h-10 w-full !justify-between !gap-2 !px-2 !py-2 !text-left"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${item.externalHref ? 'bg-emerald-100/80 text-emerald-700' : 'bg-blue-100/75 text-blue-700'}`}>{item.icon}</span>
                        <span className="truncate text-sm text-gray-800">{item.label}</span>
                        {item.externalHref && <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0 text-gray-400" />}
                      </span>
                      <span className="shrink-0 text-xs text-gray-500">{useCount} 次</span>
                    </AppButton>
                  ))}
                </div>
              ) : <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-3 text-sm text-gray-500">尚无访问记录，打开业务功能后将在此显示。</p>}
            </section>

            {toolItems.length > 0 && (
              <section aria-label="辅助工具与帮助" className="space-y-2 border-t border-gray-100 pt-3">
                <h2 className="text-sm font-semibold text-gray-900">辅助工具与帮助</h2>
                <div className="grid grid-cols-1 gap-2">
                  {toolItems.map((item) => (
                    <AppButton key={item.key} variant="secondary" onClick={() => open(item.key)} aria-label={`打开工具${item.label}`} className="!h-auto min-h-10 !justify-start !gap-2 !whitespace-normal !px-2.5 !py-2 !text-left !text-sm">
                      <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-blue-100/75 text-xs font-semibold text-blue-700">{item.icon}</span>
                      <span className="min-w-0 break-words">{item.label}</span>
                    </AppButton>
                  ))}
                </div>
              </section>
            )}
          </div>
        )
      }}
    </SharedQuickAccessPanel>
  )
}
