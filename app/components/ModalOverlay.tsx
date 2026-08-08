'use client'

import { ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function ModalOverlay({
  children,
  onClose,
  className = '',
  portalTargetId,
  lockBody = true,
  trapFocus = true,
}: {
  children: ReactNode
  onClose?: () => void
  className?: string
  portalTargetId?: string
  lockBody?: boolean
  trapFocus?: boolean
}) {
  const [mounted, setMounted] = useState(false)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    const previousOverflow = document.body.style.overflow
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (lockBody) document.body.style.overflow = 'hidden'

    const focusTimer = trapFocus ? window.setTimeout(() => {
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
      const activeDialog = dialogs.item(dialogs.length - 1)
      activeDialog?.focus()
    }, 0) : null

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current?.()
        return
      }
      if (!trapFocus || event.key !== 'Tab') return

      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
      const activeDialog = dialogs.item(dialogs.length - 1)
      if (!activeDialog) return
      const focusable = Array.from(activeDialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hasAttribute('hidden'))
      if (focusable.length === 0) {
        event.preventDefault()
        activeDialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      if (focusTimer !== null) window.clearTimeout(focusTimer)
      if (lockBody) document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [lockBody, mounted, trapFocus])

  if (!mounted) return null

  const portalTarget = portalTargetId ? document.getElementById(portalTargetId) : document.body

  return createPortal(
    <div
      role="presentation"
      onClick={(event) => {
        event.stopPropagation()
        if (event.target === event.currentTarget) onClose?.()
      }}
      className={`fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto mes-modal-overlay p-4 ${className}`}
    >
      {children}
    </div>,
    portalTarget || document.body,
  )
}
