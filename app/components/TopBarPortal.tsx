'use client'

import { ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export default function TopBarPortal({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1024px)')
    const resolveContainer = () => {
      const targetId = desktopQuery.matches ? 'topbar-actions-desktop' : 'topbar-actions-mobile'
      setContainer(document.getElementById(targetId))
    }

    resolveContainer()
    desktopQuery.addEventListener('change', resolveContainer)
    return () => desktopQuery.removeEventListener('change', resolveContainer)
  }, [])

  if (!container) return null

  return createPortal(children, container)
}
