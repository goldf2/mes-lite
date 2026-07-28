'use client'

import { useCallback, useEffect, useState } from 'react'

export const modalGlassStorageKey = 'mes-lite.preferences.modalGlass'
export const preferenceChangeEvent = 'mes-lite.preferences.changed'

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
