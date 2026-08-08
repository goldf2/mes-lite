'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  createDefaultWorkspaceNavigationConfig,
  enabledNavigationWorkspaces,
  navigationWorkspaceIds,
  normalizeWorkspaceNavigationConfig,
  type NavigationWorkspaceId,
  type WorkspaceNavigationConfig,
} from '@/lib/workspace-navigation-config'

export const workspaceNavigationChangedEvent = 'mes-lite.workspace-navigation.changed'
const activeWorkspaceStorageKey = 'mes-lite.navigation.activeWorkspace'

function readSavedWorkspace(): NavigationWorkspaceId | null {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(activeWorkspaceStorageKey)
  return navigationWorkspaceIds.includes(value as NavigationWorkspaceId) ? value as NavigationWorkspaceId : null
}

export function announceWorkspaceNavigationConfig(config: WorkspaceNavigationConfig) {
  window.dispatchEvent(new CustomEvent(workspaceNavigationChangedEvent, { detail: config }))
}

export default function useWorkspaceNavigation() {
  const [config, setConfig] = useState<WorkspaceNavigationConfig>(createDefaultWorkspaceNavigationConfig)
  const [activeWorkspace, setActiveWorkspaceState] = useState<NavigationWorkspaceId>(() => readSavedWorkspace() || 'mes')
  const [ready, setReady] = useState(false)

  const applyConfig = useCallback((value: unknown) => {
    const normalized = normalizeWorkspaceNavigationConfig(value)
    setConfig(normalized)
    setActiveWorkspaceState((current) => {
      const enabled = enabledNavigationWorkspaces(normalized)
      const next = enabled.includes(current) ? current : normalized.defaultWorkspace
      window.localStorage.setItem(activeWorkspaceStorageKey, next)
      return next
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch('/api/system/workspace-navigation')
        const body = await response.json()
        if (!cancelled && response.ok) applyConfig(body.data)
      } finally {
        if (!cancelled) setReady(true)
      }
    }
    const sync = (event: Event) => applyConfig((event as CustomEvent).detail)
    window.addEventListener(workspaceNavigationChangedEvent, sync)
    void load()
    return () => {
      cancelled = true
      window.removeEventListener(workspaceNavigationChangedEvent, sync)
    }
  }, [applyConfig])

  const setActiveWorkspace = useCallback((workspace: NavigationWorkspaceId) => {
    if (!config.workspaces[workspace].enabled) return
    setActiveWorkspaceState(workspace)
    window.localStorage.setItem(activeWorkspaceStorageKey, workspace)
  }, [config])

  return { config, activeWorkspace, setActiveWorkspace, ready }
}
