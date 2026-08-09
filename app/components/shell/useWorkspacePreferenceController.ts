'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  defaultWorkspacePreference,
  isWorkspaceFunctionKey,
  type WorkspaceFunctionKey,
  type WorkspacePreferenceValue,
} from '@/lib/workspace'

interface WorkspacePreferenceControllerOptions {
  onError: (message: string) => void
}

export default function useWorkspacePreferenceController({ onError }: WorkspacePreferenceControllerOptions) {
  const [workspacePreference, setWorkspacePreference] = useState<WorkspacePreferenceValue>(defaultWorkspacePreference)

  useEffect(() => {
    let cancelled = false
    fetch('/api/workspace-preferences')
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled || !payload.data) return
        const data = payload.data
        setWorkspacePreference({
          mode: data.mode === 'SMART' || data.mode === 'CUSTOM' ? data.mode : 'DEFAULT',
          layout: Array.isArray(data.layout) ? data.layout.filter(isWorkspaceFunctionKey) : defaultWorkspacePreference.layout,
          pinned: Array.isArray(data.pinned) ? data.pinned.filter(isWorkspaceFunctionKey) : [],
          usage: Array.isArray(data.usage)
            ? data.usage.filter((item: { functionKey?: string }) => item.functionKey && isWorkspaceFunctionKey(item.functionKey))
            : [],
        })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const saveWorkspacePreference = useCallback(async (
    next: Pick<WorkspacePreferenceValue, 'mode' | 'layout' | 'pinned'>,
  ) => {
    const response = await fetch('/api/workspace-preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    })
    const payload = await response.json()
    if (!response.ok) {
      const message = payload.error || '保存工作台设置失败'
      onError(message)
      throw new Error(message)
    }
    setWorkspacePreference((current) => ({ ...current, ...next }))
  }, [onError])

  const recordWorkspaceUsage = useCallback((functionKey: WorkspaceFunctionKey) => {
    const usedAt = new Date().toISOString()
    setWorkspacePreference((current) => {
      const existing = current.usage.find((item) => item.functionKey === functionKey)
      const usage = existing
        ? current.usage.map((item) => item.functionKey === functionKey
          ? { ...item, useCount: item.useCount + 1, lastUsedAt: usedAt }
          : item)
        : [...current.usage, { functionKey, useCount: 1, lastUsedAt: usedAt }]
      return { ...current, usage }
    })
    void fetch('/api/workspace-usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ functionKey }),
    }).catch(() => undefined)
  }, [])

  return {
    workspacePreference,
    saveWorkspacePreference,
    recordWorkspaceUsage,
  }
}
