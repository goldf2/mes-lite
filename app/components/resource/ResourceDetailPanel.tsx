'use client'

import { ArrowLeft, ChevronLeft, ChevronRight, MoreHorizontal, Pencil, X } from 'lucide-react'
import { ReactNode, useState } from 'react'
import AppButton from '../AppButton'
import { useAdaptiveMasterDetailContext } from '../layout/AdaptiveMasterDetailWorkspace'
import useDismissibleSearchPopup from '../useDismissibleSearchPopup'

export default function ResourceDetailPanel({
  title,
  subtitle,
  status,
  position,
  total,
  editing = false,
  onPrevious,
  onNext,
  onEdit,
  onClose,
  headerActions,
  moreActions,
  children,
  footer,
}: {
  title: ReactNode
  subtitle?: ReactNode
  status?: ReactNode
  position?: number
  total?: number
  editing?: boolean
  onPrevious?: () => void
  onNext?: () => void
  onEdit?: () => void
  onClose: () => void
  headerActions?: ReactNode
  moreActions?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const adaptiveWorkspace = useAdaptiveMasterDetailContext()
  const moreRootRef = useDismissibleSearchPopup<HTMLDivElement>(moreOpen, () => setMoreOpen(false))
  const hasNavigation = position !== undefined || onPrevious || onNext
  const navigationControls = (compact = false) => hasNavigation ? (
    <div className={`flex items-center gap-0.5 ${compact ? '' : 'mr-1 border-r border-gray-200 pr-2'}`}>
      {position !== undefined && total !== undefined && (
        <span className={`mr-1 whitespace-nowrap text-xs tabular-nums text-gray-400 ${compact ? 'hidden min-[430px]:inline' : ''}`}>
          {compact ? `${position} / ${total}` : `${position} / ${total}`}
        </span>
      )}
      <AppButton
        variant="ghost"
        size="icon"
        className="!h-8 !w-8"
        onClick={onPrevious}
        disabled={!onPrevious}
        aria-label="上一条"
        title="上一条"
      >
        <ChevronLeft aria-hidden="true" size={17} />
      </AppButton>
      <AppButton
        variant="ghost"
        size="icon"
        className="!h-8 !w-8"
        onClick={onNext}
        disabled={!onNext}
        aria-label="下一条"
        title="下一条"
      >
        <ChevronRight aria-hidden="true" size={17} />
      </AppButton>
    </div>
  ) : null

  return (
    <aside aria-label={editing ? '编辑资源' : '资源详情'} className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <header className="mes-resource-detail-header shrink-0 border-b px-3 py-2.5 sm:px-5 sm:py-3">
        {!adaptiveWorkspace?.hideCompactBack && (
          <div className="mb-1 sm:hidden">
            <AppButton
              variant="ghost"
              size="sm"
              className="!-ml-2 !px-2 text-blue-700"
              onClick={onClose}
            >
              <ArrowLeft aria-hidden="true" size={16} />
              返回列表
            </AppButton>
          </div>
        )}
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 sm:flex sm:items-start sm:justify-between sm:gap-3">
          <div className="contents sm:block sm:min-w-0">
            <div className="col-span-2 flex min-w-0 items-center gap-2 sm:flex-wrap">
              <h2 className="truncate text-base font-semibold text-gray-900">{title}</h2>
              <span className="shrink-0">{status}</span>
              {editing && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">编辑中</span>}
            </div>
            {subtitle && <div className="min-w-0 truncate text-xs text-gray-500 sm:mt-1">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center justify-end gap-0.5 sm:gap-1">
            <div className="sm:hidden">{navigationControls(true)}</div>
            <div className="hidden sm:block">{navigationControls()}</div>
            {headerActions}
            {onEdit && !editing && (
              <>
                <AppButton variant="ghost" size="icon" className="!h-8 !w-8 sm:hidden" onClick={onEdit} aria-label="编辑" title="编辑">
                  <Pencil aria-hidden="true" size={16} />
                </AppButton>
                <AppButton size="sm" className="hidden sm:inline-flex" onClick={onEdit}>编辑</AppButton>
              </>
            )}
            {moreActions && (
              <div ref={moreRootRef} className="relative">
                <AppButton
                  variant="ghost"
                  size="icon"
                  className="!h-8 !w-8"
                  onClick={() => setMoreOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  aria-label="更多操作"
                  title="更多操作"
                >
                  <MoreHorizontal aria-hidden="true" size={18} />
                </AppButton>
                {moreOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-36 overflow-hidden rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg"
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest('button')) setMoreOpen(false)
                    }}
                  >
                    {moreActions}
                  </div>
                )}
              </div>
            )}
            <span className="hidden sm:block">
              <AppButton variant="ghost" size="icon" className="!h-8 !w-8" onClick={onClose} aria-label="关闭详情" title="关闭详情">
                <X aria-hidden="true" size={18} />
              </AppButton>
            </span>
          </div>
        </div>
      </header>
      <div className="mes-resource-detail-content min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
      {footer && <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50 px-4 py-3 sm:flex-row sm:justify-end sm:px-5">{footer}</footer>}
    </aside>
  )
}
