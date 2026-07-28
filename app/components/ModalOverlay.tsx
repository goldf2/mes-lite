'use client'

import { ReactNode, useEffect, useState } from 'react'
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

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose?.()
    }

    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [mounted, onClose])

  if (!mounted) return null

  return createPortal(
    <div
      role="presentation"
      onClick={(event) => {
        event.stopPropagation()
        if (event.target === event.currentTarget) onClose?.()
      }}
      className={`fixed inset-0 z-50 flex items-center justify-center overflow-y-auto mes-modal-overlay p-4 ${className}`}
    >
      {children}
    </div>,
    document.body,
  )
}
