'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  useDesktopNavigationPreference,
  useSiblingNavigationPreference,
  useWorkspaceLayoutPreference,
} from '../interfacePreferences'
import type { DesktopNavigationMode } from '../navigation/DesktopNavigation'

const desktopSidebarStorageKey = 'mes-lite.layout.desktopSidebarWidth'
const desktopSplitSidebarStorageKey = 'mes-lite.layout.desktopSplitSidebarWidth'
const defaultDesktopSidebarWidth = 224
const minDesktopSidebarWidth = 184
const maxDesktopSidebarWidth = 320
const defaultDesktopSplitSidebarWidth = 296
const minDesktopSplitSidebarWidth = 264
const maxDesktopSplitSidebarWidth = 384
const hoverCloseDelayMs = 320

type TransientNavigationMode = 'closed' | 'hover' | 'click'

export default function useDesktopNavigationController() {
  const [navigationPreference] = useDesktopNavigationPreference()
  const [workspaceLayoutPreference, setWorkspaceLayoutPreference] = useWorkspaceLayoutPreference()
  const [siblingNavigationEnabled] = useSiblingNavigationPreference()
  const [transientNavigationMode, setTransientNavigationMode] = useState<TransientNavigationMode>('closed')
  const [sidebarWidth, setSidebarWidth] = useState(defaultDesktopSidebarWidth)
  const [splitSidebarWidth, setSplitSidebarWidth] = useState(defaultDesktopSplitSidebarWidth)
  const [sidebarReady, setSidebarReady] = useState(false)
  const [wideDesktopNavigation, setWideDesktopNavigation] = useState(false)
  const [resizingMode, setResizingMode] = useState<DesktopNavigationMode | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeTimerRef = useRef<number | null>(null)

  const desktopNavigationMode = navigationPreference.mode
  const desktopNavigationDisplayMode = navigationPreference.displayMode
  const standardWorkspaceLayout = workspaceLayoutPreference.layout === 'sidebar'
  const autoHideDesktopNavigation = standardWorkspaceLayout && workspaceLayoutPreference.navigationBehavior === 'auto-hide'
  const persistentDesktopNavigation = standardWorkspaceLayout && workspaceLayoutPreference.navigationBehavior === 'persistent'
  const splitNavigationVisible = desktopNavigationMode === 'split' && wideDesktopNavigation
  const sidebarResizeMin = splitNavigationVisible ? minDesktopSplitSidebarWidth : minDesktopSidebarWidth
  const sidebarResizeMax = splitNavigationVisible ? maxDesktopSplitSidebarWidth : maxDesktopSidebarWidth
  const sidebarResizeValue = splitNavigationVisible ? splitSidebarWidth : sidebarWidth
  const transientNavigationOpen = transientNavigationMode !== 'closed'

  const cancelScheduledClose = useCallback(() => {
    if (closeTimerRef.current === null) return
    window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
  }, [])

  const closeTransientNavigation = useCallback(() => {
    cancelScheduledClose()
    setTransientNavigationMode('closed')
  }, [cancelScheduledClose])

  const scheduleDesktopNavigationOpen = useCallback(() => {
    if (!autoHideDesktopNavigation) return
    cancelScheduledClose()
    setTransientNavigationMode((current) => current === 'closed' ? 'hover' : current)
  }, [autoHideDesktopNavigation, cancelScheduledClose])

  const keepDesktopNavigationOpen = useCallback(() => {
    cancelScheduledClose()
  }, [cancelScheduledClose])

  const scheduleDesktopNavigationClose = useCallback(() => {
    if (!autoHideDesktopNavigation || resizingMode || closeTimerRef.current !== null) return
    closeTimerRef.current = window.setTimeout(() => {
      setTransientNavigationMode((current) => current === 'hover' ? 'closed' : current)
      closeTimerRef.current = null
    }, hoverCloseDelayMs)
  }, [autoHideDesktopNavigation, resizingMode])

  const toggleDesktopNavigation = useCallback(() => {
    cancelScheduledClose()
    if (persistentDesktopNavigation) {
      setWorkspaceLayoutPreference({ navigationBehavior: 'auto-hide' })
      setTransientNavigationMode('closed')
      return
    }
    setTransientNavigationMode((current) => current === 'click' ? 'closed' : 'click')
  }, [cancelScheduledClose, persistentDesktopNavigation, setWorkspaceLayoutPreference])

  const toggleWorkspaceLayout = useCallback(() => {
    closeTransientNavigation()
    setWorkspaceLayoutPreference({ layout: workspaceLayoutPreference.layout === 'canvas' ? 'sidebar' : 'canvas' })
  }, [closeTransientNavigation, setWorkspaceLayoutPreference, workspaceLayoutPreference.layout])

  const toggleNavigationBehavior = useCallback(() => {
    cancelScheduledClose()
    if (autoHideDesktopNavigation) {
      setWorkspaceLayoutPreference({ navigationBehavior: 'persistent' })
      setTransientNavigationMode('closed')
      return
    }
    setWorkspaceLayoutPreference({ navigationBehavior: 'auto-hide' })
    setTransientNavigationMode('closed')
  }, [autoHideDesktopNavigation, cancelScheduledClose, setWorkspaceLayoutPreference])

  useEffect(() => {
    if (autoHideDesktopNavigation) return
    closeTransientNavigation()
  }, [autoHideDesktopNavigation, closeTransientNavigation])

  useEffect(() => {
    if (!autoHideDesktopNavigation || !transientNavigationOpen) return
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      closeTransientNavigation()
    }
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      closeTransientNavigation()
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [autoHideDesktopNavigation, closeTransientNavigation, transientNavigationOpen])

  useEffect(() => () => {
    cancelScheduledClose()
  }, [cancelScheduledClose])

  useEffect(() => {
    const savedWidth = Number(window.localStorage.getItem(desktopSidebarStorageKey))
    const savedSplitWidth = Number(window.localStorage.getItem(desktopSplitSidebarStorageKey))
    if (Number.isFinite(savedWidth) && savedWidth >= minDesktopSidebarWidth && savedWidth <= maxDesktopSidebarWidth) {
      setSidebarWidth(savedWidth)
    }
    if (
      Number.isFinite(savedSplitWidth)
      && savedSplitWidth >= minDesktopSplitSidebarWidth
      && savedSplitWidth <= maxDesktopSplitSidebarWidth
    ) {
      setSplitSidebarWidth(savedSplitWidth)
    }
    setSidebarReady(true)
  }, [])

  useEffect(() => {
    if (!sidebarReady) return
    window.localStorage.setItem(desktopSidebarStorageKey, String(sidebarWidth))
    window.localStorage.setItem(desktopSplitSidebarStorageKey, String(splitSidebarWidth))
  }, [sidebarReady, sidebarWidth, splitSidebarWidth])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1280px)')
    const sync = () => setWideDesktopNavigation(mediaQuery.matches)
    sync()
    mediaQuery.addEventListener('change', sync)
    return () => mediaQuery.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!resizingMode) return

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const resize = (event: globalThis.PointerEvent) => {
      if (resizingMode === 'split') {
        setSplitSidebarWidth(Math.min(maxDesktopSplitSidebarWidth, Math.max(minDesktopSplitSidebarWidth, event.clientX)))
        return
      }
      setSidebarWidth(Math.min(maxDesktopSidebarWidth, Math.max(minDesktopSidebarWidth, event.clientX)))
    }
    const stop = () => setResizingMode(null)

    window.addEventListener('pointermove', resize)
    window.addEventListener('pointerup', stop, { once: true })
    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', resize)
      window.removeEventListener('pointerup', stop)
    }
  }, [resizingMode])

  const handleSidebarResizePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    keepDesktopNavigationOpen()
    setTransientNavigationMode((current) => current === 'hover' ? 'click' : current)
    setResizingMode(splitNavigationVisible ? 'split' : 'accordion')
  }, [keepDesktopNavigationOpen, splitNavigationVisible])

  const resetSidebarWidth = useCallback(() => {
    if (splitNavigationVisible) setSplitSidebarWidth(defaultDesktopSplitSidebarWidth)
    else setSidebarWidth(defaultDesktopSidebarWidth)
  }, [splitNavigationVisible])

  const handleSidebarResizeKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowRight' ? 8 : -8
    if (splitNavigationVisible) {
      setSplitSidebarWidth((current) => Math.min(maxDesktopSplitSidebarWidth, Math.max(minDesktopSplitSidebarWidth, current + delta)))
      return
    }
    setSidebarWidth((current) => Math.min(maxDesktopSidebarWidth, Math.max(minDesktopSidebarWidth, current + delta)))
  }, [splitNavigationVisible])

  return {
    desktopNavigationMode,
    desktopNavigationDisplayMode,
    workspaceLayoutPreference,
    siblingNavigationEnabled,
    transientNavigationMode,
    transientNavigationOpen,
    sidebarWidth,
    splitSidebarWidth,
    resizing: resizingMode !== null,
    autoHideDesktopNavigation,
    persistentDesktopNavigation,
    splitNavigationVisible,
    sidebarResizeMin,
    sidebarResizeMax,
    sidebarResizeValue,
    panelRef,
    triggerRef,
    scheduleDesktopNavigationOpen,
    keepDesktopNavigationOpen,
    scheduleDesktopNavigationClose,
    toggleDesktopNavigation,
    closeTransientNavigation,
    toggleWorkspaceLayout,
    toggleNavigationBehavior,
    handleSidebarResizePointerDown,
    resetSidebarWidth,
    handleSidebarResizeKeyDown,
  }
}
