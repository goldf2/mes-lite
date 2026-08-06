'use client'

import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'

export type ToolbarSlot = 'search' | 'advanced' | 'view' | 'options' | 'actions'

export const defaultToolbarOrder: readonly ToolbarSlot[] = ['search', 'advanced', 'view', 'options', 'actions']
export const toolbarOrderEvent = 'mes-lite:toolbar-order-change'

const slotLabels: Record<ToolbarSlot, string> = {
  search: '关键词搜索',
  advanced: '高级搜索',
  view: '视图方式',
  options: '页内选项',
  actions: '业务操作',
}

function storageKey(pageKey: string) {
  return `mes-lite.toolbar.order.${pageKey}`
}

function showUnavailableStorageKey(pageKey: string) {
  return `mes-lite.toolbar.show-unavailable.${pageKey}`
}

export function readToolbarOrder(pageKey: string): ToolbarSlot[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(pageKey)) || '[]')
    if (!Array.isArray(parsed)) return [...defaultToolbarOrder]
    const valid = parsed.filter((item): item is ToolbarSlot => defaultToolbarOrder.includes(item))
    return Array.from(new Set([...valid, ...defaultToolbarOrder]))
  } catch {
    return [...defaultToolbarOrder]
  }
}

export function writeToolbarOrder(pageKey: string, order: readonly ToolbarSlot[]) {
  window.localStorage.setItem(storageKey(pageKey), JSON.stringify(order))
  window.dispatchEvent(new CustomEvent(toolbarOrderEvent, { detail: pageKey }))
}

export function readShowUnavailableToolbarSlots(pageKey: string) {
  return window.localStorage.getItem(showUnavailableStorageKey(pageKey)) !== 'false'
}

export function writeShowUnavailableToolbarSlots(pageKey: string, visible: boolean) {
  window.localStorage.setItem(showUnavailableStorageKey(pageKey), String(visible))
  window.dispatchEvent(new CustomEvent(toolbarOrderEvent, { detail: pageKey }))
}

export function useToolbarOrder(pageKey: string) {
  const [order, setOrder] = useState<ToolbarSlot[]>([...defaultToolbarOrder])

  useEffect(() => {
    const sync = () => setOrder(readToolbarOrder(pageKey))
    const handleChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === pageKey) sync()
    }
    sync()
    window.addEventListener(toolbarOrderEvent, handleChange)
    return () => window.removeEventListener(toolbarOrderEvent, handleChange)
  }, [pageKey])

  return order
}

export function useShowUnavailableToolbarSlots(pageKey: string) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const sync = () => setVisible(readShowUnavailableToolbarSlots(pageKey))
    const handleChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === pageKey) sync()
    }
    sync()
    window.addEventListener(toolbarOrderEvent, handleChange)
    return () => window.removeEventListener(toolbarOrderEvent, handleChange)
  }, [pageKey])

  return visible
}

export default function ToolbarOrderSettings({ pageKey }: { pageKey: string }) {
  const order = useToolbarOrder(pageKey)
  const showUnavailable = useShowUnavailableToolbarSlots(pageKey)

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= order.length) return
    const next = [...order]
    ;[next[index], next[target]] = [next[target], next[index]]
    writeToolbarOrder(pageKey, next)
  }

  return (
    <section>
      <div className="text-sm font-semibold text-gray-900">顶部工具顺序</div>
      <p className="mt-1 text-xs text-gray-500">调整只影响当前页面和当前浏览器；业务操作作为一组移动。</p>
      <div className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
        {order.map((slot, index) => (
          <div key={slot} className="flex items-center gap-3 bg-white px-3 py-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gray-100 text-xs font-semibold text-gray-500">{index + 1}</span>
            <span className="min-w-0 flex-1 text-sm text-gray-800">{slotLabels[slot]}</span>
            <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`上移${slotLabels[slot]}`} className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-25"><ArrowUp className="h-4 w-4" /></button>
            <button type="button" onClick={() => move(index, 1)} disabled={index === order.length - 1} aria-label={`下移${slotLabels[slot]}`} className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-25"><ArrowDown className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
        <input type="checkbox" checked={showUnavailable} onChange={(event) => writeShowUnavailableToolbarSlots(pageKey, event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
        <span><span className="block text-sm text-gray-800">显示不可用工具占位</span><span className="mt-0.5 block text-xs text-gray-500">保持切换页面时搜索、高级搜索和视图按钮的位置稳定。</span></span>
      </label>
      <button type="button" onClick={() => writeToolbarOrder(pageKey, defaultToolbarOrder)} className="mt-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"><RotateCcw className="h-4 w-4" />恢复默认顺序</button>
    </section>
  )
}
