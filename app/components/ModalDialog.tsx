'use client'

import { ReactNode, useId, useState } from 'react'
import AppButton, { AppButtonVariant } from './AppButton'
import FullscreenToggleButton from './FullscreenToggleButton'
import ModalOverlay from './ModalOverlay'

const widthClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  wide: 'max-w-6xl',
}

export default function ModalDialog({
  title,
  description,
  headerActions,
  onClose,
  children,
  footer,
  size = 'md',
  closeDisabled = false,
  bodyClassName = '',
  panelClassName = '',
  overlayClassName = '',
  fullscreenable = true,
  initialFullscreen = false,
}: {
  title: ReactNode
  description?: ReactNode
  headerActions?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: keyof typeof widthClasses
  closeDisabled?: boolean
  bodyClassName?: string
  panelClassName?: string
  overlayClassName?: string
  fullscreenable?: boolean
  initialFullscreen?: boolean
}) {
  const titleId = useId()
  const descriptionId = useId()
  const [fullscreen, setFullscreen] = useState(fullscreenable && initialFullscreen)
  const dismiss = fullscreen ? () => setFullscreen(false) : closeDisabled ? undefined : onClose

  return (
    <ModalOverlay
      onClose={dismiss}
      dismissOnBackdrop={false}
      className={`${fullscreen ? '!bg-white !p-0' : ''} ${overlayClassName}`}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`flex w-full flex-col overflow-hidden bg-white ${fullscreen ? 'h-[100dvh] max-h-none max-w-none rounded-none border-0 shadow-2xl' : `max-h-[min(92dvh,960px)] ${widthClasses[size]} rounded-xl border border-gray-200 shadow-2xl`} ${panelClassName}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h3 id={titleId} className="text-lg font-semibold text-gray-900">{title}</h3>
            {description && <div id={descriptionId} className="mt-1 text-sm text-gray-500">{description}</div>}
          </div>
          <div className="-mr-2 -mt-2 flex shrink-0 items-center gap-2">
            {headerActions}
            {fullscreenable && (
              <FullscreenToggleButton fullscreen={fullscreen} onChange={setFullscreen} />
            )}
            <AppButton
              variant="ghost"
              size="icon"
              onClick={onClose}
              disabled={closeDisabled}
              aria-label="关闭弹窗"
              title="关闭"
            >
              <span aria-hidden="true" className="text-2xl leading-none">×</span>
            </AppButton>
          </div>
        </header>
        <div className={`min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 ${bodyClassName}`}>
          {children}
        </div>
        {footer && (
          <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-4 sm:flex-row sm:justify-end sm:px-6 [&>button]:w-full sm:[&>button]:w-auto">
            {footer}
          </footer>
        )}
      </section>
    </ModalOverlay>
  )
}

export function ModalActions({
  onCancel,
  onConfirm,
  cancelLabel = '取消',
  confirmLabel = '保存',
  confirmVariant = 'primary',
  disabled = false,
  busy = false,
}: {
  onCancel: () => void
  onConfirm: () => void
  cancelLabel?: string
  confirmLabel?: string
  confirmVariant?: AppButtonVariant
  disabled?: boolean
  busy?: boolean
}) {
  return (
    <>
      <AppButton variant="secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</AppButton>
      <AppButton variant={confirmVariant} onClick={onConfirm} disabled={disabled || busy}>
        {busy ? '处理中…' : confirmLabel}
      </AppButton>
    </>
  )
}
