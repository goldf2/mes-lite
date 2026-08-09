'use client'

import { useCallback, useEffect, useState } from 'react'
import type { DesktopNavigationDisplayMode, DesktopNavigationMode } from './navigation/DesktopNavigation'

export const modalGlassStorageKey = 'mes-lite.preferences.modalGlass'
export const preferenceChangeEvent = 'mes-lite.preferences.changed'
export const desktopNavigationModeStorageKey = 'mes-lite.layout.desktopNavigationMode'
export const desktopNavigationDisplayModeStorageKey = 'mes-lite.layout.desktopNavigationDisplayMode'
export const workspaceLayoutStorageKey = 'mes-lite.layout.workspaceMode'
export const desktopNavigationBehaviorStorageKey = 'mes-lite.layout.desktopNavigationBehavior'
export const siblingNavigationStorageKey = 'mes-lite.preferences.siblingNavigation'

export type WorkspaceLayoutMode = 'sidebar' | 'canvas'
export type DesktopNavigationBehavior = 'persistent' | 'auto-hide'

export function readDesktopNavigationPreference() {
  const defaultValue: { mode: DesktopNavigationMode; displayMode: DesktopNavigationDisplayMode } = {
    mode: 'accordion',
    displayMode: 'icon-label',
  }
  if (typeof window === 'undefined') return defaultValue
  const savedMode = window.localStorage.getItem(desktopNavigationModeStorageKey)
  const savedDisplayMode = window.localStorage.getItem(desktopNavigationDisplayModeStorageKey)
  return {
    mode: savedMode === 'split' ? 'split' : 'accordion',
    displayMode: savedDisplayMode === 'icon' || savedDisplayMode === 'label' ? savedDisplayMode : 'icon-label',
  } as const
}

export function setDesktopNavigationPreference(mode: DesktopNavigationMode, displayMode: DesktopNavigationDisplayMode) {
  window.localStorage.setItem(desktopNavigationModeStorageKey, mode)
  window.localStorage.setItem(desktopNavigationDisplayModeStorageKey, displayMode)
  window.dispatchEvent(new CustomEvent(preferenceChangeEvent, { detail: { navigationMode: mode, navigationDisplayMode: displayMode } }))
}

export function useDesktopNavigationPreference() {
  const [value, setValue] = useState(readDesktopNavigationPreference)

  useEffect(() => {
    const sync = () => setValue(readDesktopNavigationPreference())
    sync()
    window.addEventListener('storage', sync)
    window.addEventListener(preferenceChangeEvent, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(preferenceChangeEvent, sync)
    }
  }, [])

  const update = useCallback((next: { mode?: DesktopNavigationMode; displayMode?: DesktopNavigationDisplayMode }) => {
    setValue((current) => {
      const resolved = { mode: next.mode || current.mode, displayMode: next.displayMode || current.displayMode }
      setDesktopNavigationPreference(resolved.mode, resolved.displayMode)
      return resolved
    })
  }, [])

  return [value, update] as const
}

export function readWorkspaceLayoutPreference() {
  const defaultValue: { layout: WorkspaceLayoutMode; navigationBehavior: DesktopNavigationBehavior } = {
    layout: 'sidebar',
    navigationBehavior: 'persistent',
  }
  if (typeof window === 'undefined') return defaultValue
  return {
    layout: window.localStorage.getItem(workspaceLayoutStorageKey) === 'canvas' ? 'canvas' : 'sidebar',
    navigationBehavior: window.localStorage.getItem(desktopNavigationBehaviorStorageKey) === 'auto-hide' ? 'auto-hide' : 'persistent',
  } as const
}

export function setWorkspaceLayoutPreference(layout: WorkspaceLayoutMode, navigationBehavior: DesktopNavigationBehavior) {
  window.localStorage.setItem(workspaceLayoutStorageKey, layout)
  window.localStorage.setItem(desktopNavigationBehaviorStorageKey, navigationBehavior)
  window.dispatchEvent(new CustomEvent(preferenceChangeEvent, { detail: { workspaceLayout: layout, navigationBehavior } }))
}

export function useWorkspaceLayoutPreference() {
  const [value, setValue] = useState(readWorkspaceLayoutPreference)

  useEffect(() => {
    const sync = () => setValue(readWorkspaceLayoutPreference())
    sync()
    window.addEventListener('storage', sync)
    window.addEventListener(preferenceChangeEvent, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(preferenceChangeEvent, sync)
    }
  }, [])

  const update = useCallback((next: { layout?: WorkspaceLayoutMode; navigationBehavior?: DesktopNavigationBehavior }) => {
    setValue((current) => {
      const resolved = {
        layout: next.layout || current.layout,
        navigationBehavior: next.navigationBehavior || current.navigationBehavior,
      }
      setWorkspaceLayoutPreference(resolved.layout, resolved.navigationBehavior)
      return resolved
    })
  }, [])

  return [value, update] as const
}

function readSiblingNavigationPreference() {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(siblingNavigationStorageKey) !== 'off'
}

export function setSiblingNavigationPreference(enabled: boolean) {
  window.localStorage.setItem(siblingNavigationStorageKey, enabled ? 'on' : 'off')
  window.dispatchEvent(new CustomEvent(preferenceChangeEvent, { detail: { siblingNavigation: enabled } }))
}

export function useSiblingNavigationPreference() {
  const [enabled, setEnabled] = useState(readSiblingNavigationPreference)

  useEffect(() => {
    const sync = () => setEnabled(readSiblingNavigationPreference())
    sync()
    window.addEventListener('storage', sync)
    window.addEventListener(preferenceChangeEvent, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(preferenceChangeEvent, sync)
    }
  }, [])

  const update = useCallback((nextValue: boolean) => {
    setEnabled(nextValue)
    setSiblingNavigationPreference(nextValue)
  }, [])

  return [enabled, update] as const
}

function readModalGlassPreference() {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(modalGlassStorageKey) !== 'off'
}

function applyModalGlassPreference(enabled: boolean) {
  if (typeof document === 'undefined') return
  document.body.dataset.modalGlass = enabled ? 'on' : 'off'
}

export function setModalGlassPreference(enabled: boolean) {
  window.localStorage.setItem(modalGlassStorageKey, enabled ? 'on' : 'off')
  applyModalGlassPreference(enabled)
  window.dispatchEvent(new CustomEvent(preferenceChangeEvent, { detail: { modalGlass: enabled } }))
}

export function useModalGlassPreference() {
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    const sync = () => {
      const nextValue = readModalGlassPreference()
      setEnabled(nextValue)
      applyModalGlassPreference(nextValue)
    }

    sync()
    window.addEventListener('storage', sync)
    window.addEventListener(preferenceChangeEvent, sync)

    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(preferenceChangeEvent, sync)
    }
  }, [])

  const update = useCallback((nextValue: boolean) => {
    setEnabled(nextValue)
    setModalGlassPreference(nextValue)
  }, [])

  return [enabled, update] as const
}

export function InterfacePreferenceSync() {
  useEffect(() => {
    const sync = () => applyModalGlassPreference(readModalGlassPreference())

    sync()
    window.addEventListener('storage', sync)
    window.addEventListener(preferenceChangeEvent, sync)

    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(preferenceChangeEvent, sync)
    }
  }, [])

  return null
}
