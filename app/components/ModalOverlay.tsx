'use client'

import { ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function ModalOverlay({
  children,
  onClose,
  className = '',
}: {
  children: ReactNode
  onClose?: () => void
  className?: string
}) {
  const [mounted, setMounted] = useState(false)
  const onCloseRef = useRef(onClose)
  const rootRef = useRef<HTMLDivElement | null>(null)

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
    document.body.style.overflow = 'hidden'

    const focusTimer = window.setTimeout(() => {
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
      const activeDialog = dialogs.item(dialogs.length - 1)
      if (activeDialog && rootRef.current?.contains(activeDialog)) activeDialog.focus()
    }, 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
      const activeDialog = dialogs.item(dialogs.length - 1)
      if (!activeDialog || !rootRef.current?.contains(activeDialog)) return

      if (event.key === 'Escape') {
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab') return

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
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [mounted])

  if (!mounted) return null

  return createPortal(
    <div
      ref={rootRef}
      role="presentation"
      onClick={(event) => {
        event.stopPropagation()
        if (event.target === event.currentTarget) onClose?.()
      }}
      className={`fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto mes-modal-overlay p-4 ${className}`}
    >
      {children}
    </div>,
    document.body,
  )
}
