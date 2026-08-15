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
import { loadWorkspaceNavigationConfig, workspaceNavigationChangedEvent } from './workspace-navigation-api'
const activeWorkspaceStorageKey = 'mes-lite.navigation.activeWorkspace'

function readSavedWorkspace(): NavigationWorkspaceId | null {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(activeWorkspaceStorageKey)
  return navigationWorkspaceIds.includes(value as NavigationWorkspaceId) ? value as NavigationWorkspaceId : null
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
        const config = await loadWorkspaceNavigationConfig()
        if (!cancelled) applyConfig(config)
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

  return { config, activeWorkspace, ready }
}
