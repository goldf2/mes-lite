'use client'

import type { RefObject } from 'react'
import { OperatorBadge, type CurrentOperator } from '../AuthGate'

export default function AccountMenu({
  containerRef,
  operator,
  appVersion,
  open,
  onToggle,
  onLogout,
  compact = false,
}: {
  containerRef: RefObject<HTMLDivElement>
  operator: CurrentOperator
  appVersion: string
  open: boolean
  onToggle: () => void
  onLogout: () => void
  compact?: boolean
}) {
  return (
    <div ref={containerRef} className={compact ? 'static shrink-0' : 'relative shrink-0'}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
        className={`flex items-center rounded-lg border border-gray-200 bg-white font-medium text-gray-700 hover:bg-gray-50 ${
          compact ? 'gap-1 px-2 py-1.5 text-xs' : 'gap-2 px-3 py-2 text-sm'
        }`}
      >
        <span className={compact ? '' : 'max-w-32 truncate'}>{compact ? '我' : operator.name}</span>
        <span aria-hidden="true" className="text-gray-400">▾</span>
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-50 mt-2 max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-white shadow-lg ${
            compact
              ? 'inset-x-3 sm:left-auto sm:right-4 sm:w-64'
              : 'right-0 w-64'
          }`}
        >
          <div className="border-b border-gray-100 px-4 py-3">
            <OperatorBadge operator={operator} />
            <div className="mt-1 text-xs font-medium text-gray-400">MES-lite v{appVersion}</div>
          </div>
          <div className="p-2">
            <button
              type="button"
              role="menuitem"
              onClick={onLogout}
              className="flex w-full items-center justify-center rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              退出登录
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
