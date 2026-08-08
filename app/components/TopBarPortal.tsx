'use client'

import { ReactNode, useContext, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { PageToolbarRegistrationContext } from './page-modules/PageModuleBoundary'
import { useWorkspaceLayoutPreference } from './interfacePreferences'

export default function TopBarPortal({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const registerToolbar = useContext(PageToolbarRegistrationContext)
  const [workspaceLayoutPreference] = useWorkspaceLayoutPreference()

  useEffect(() => registerToolbar?.(), [registerToolbar])

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1024px)')
    const resolveContainer = () => {
      const targetId = desktopQuery.matches
        ? workspaceLayoutPreference.layout === 'canvas' ? 'page-tools-desktop' : 'topbar-actions-desktop'
        : 'topbar-actions-mobile'
      setContainer(document.getElementById(targetId))
    }

    resolveContainer()
    desktopQuery.addEventListener('change', resolveContainer)
    return () => desktopQuery.removeEventListener('change', resolveContainer)
  }, [workspaceLayoutPreference.layout])

  if (!container) return null

  return createPortal(children, container)
}
