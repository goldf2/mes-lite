'use client'

import { useEffect, useRef } from 'react'

export default function useDismissibleSearchPopup<T extends HTMLElement>(
  open: boolean,
  onDismiss: () => void
) {
  const rootRef = useRef<T | null>(null)

  useEffect(() => {
    if (!open) return

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const root = rootRef.current
      if (!root || root.contains(event.target as Node)) return
      onDismiss()
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }

    document.addEventListener('pointerdown', closeOnOutsidePointerDown, true)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointerDown, true)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open, onDismiss])

  return rootRef
}
