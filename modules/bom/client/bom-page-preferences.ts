'use client'

import { useCallback, useEffect, useState } from 'react'

export const bomPagePreferencesStorageKey = 'mes-lite.boms.pagePreferences'
export const bomPagePreferencesChangeEvent = 'mes-lite.boms.pagePreferences.changed'

export interface BomPagePreferences {
  lengthUnit: string
  weightUnit: string
}

export const defaultBomPagePreferences: BomPagePreferences = {
  lengthUnit: 'mm',
  weightUnit: 'g',
}

export function readBomPagePreferences(): BomPagePreferences {
  if (typeof window === 'undefined') return defaultBomPagePreferences
  try {
    const saved = JSON.parse(window.localStorage.getItem(bomPagePreferencesStorageKey) || '{}') as Partial<BomPagePreferences>
    return {
      lengthUnit: typeof saved.lengthUnit === 'string' && saved.lengthUnit ? saved.lengthUnit : defaultBomPagePreferences.lengthUnit,
      weightUnit: typeof saved.weightUnit === 'string' && saved.weightUnit ? saved.weightUnit : defaultBomPagePreferences.weightUnit,
    }
  } catch {
    window.localStorage.removeItem(bomPagePreferencesStorageKey)
    return defaultBomPagePreferences
  }
}

export function setBomPagePreferences(preferences: BomPagePreferences) {
  window.localStorage.setItem(bomPagePreferencesStorageKey, JSON.stringify(preferences))
  window.dispatchEvent(new CustomEvent(bomPagePreferencesChangeEvent, { detail: preferences }))
}

export function useBomPagePreferences() {
  const [preferences, setPreferences] = useState(defaultBomPagePreferences)

  useEffect(() => {
    const sync = () => setPreferences(readBomPagePreferences())

    sync()
    window.addEventListener('storage', sync)
    window.addEventListener(bomPagePreferencesChangeEvent, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(bomPagePreferencesChangeEvent, sync)
    }
  }, [])

  const update = useCallback((nextPreferences: BomPagePreferences) => {
    setBomPagePreferences(nextPreferences)
    setPreferences(nextPreferences)
  }, [])

  return [preferences, update] as const
}
