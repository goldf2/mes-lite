'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  defaultWorkspacePreference,
  isWorkspaceFunctionKey,
  type WorkspaceFunctionKey,
  type WorkspacePreferenceValue,
} from '@/lib/workspace'
import {
  loadWorkspacePreference,
  recordWorkspaceUsage as recordWorkspaceUsageRequest,
  saveWorkspacePreference as saveWorkspacePreferenceRequest,
} from '@/modules/workspace/client/workspace-preferences-api'

interface WorkspacePreferenceControllerOptions {
  onError: (message: string) => void
}

export default function useWorkspacePreferenceController({ onError }: WorkspacePreferenceControllerOptions) {
  const [workspacePreference, setWorkspacePreference] = useState<WorkspacePreferenceValue>(defaultWorkspacePreference)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const readyRef = useRef(false)
  const savingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    loadWorkspacePreference()
      .then((data) => {
        if (cancelled || !data) return
        setWorkspacePreference({
          mode: data.mode === 'SMART' || data.mode === 'CUSTOM' ? data.mode : 'DEFAULT',
          layout: Array.isArray(data.layout) ? data.layout.filter(isWorkspaceFunctionKey) : defaultWorkspacePreference.layout,
          pinned: Array.isArray(data.pinned) ? data.pinned.filter(isWorkspaceFunctionKey) : [],
          usage: Array.isArray(data.usage)
            ? data.usage.filter((item: { functionKey?: string }) => item.functionKey && isWorkspaceFunctionKey(item.functionKey))
            : [],
        })
        readyRef.current = true
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) onError('个人工作台设置加载失败，请刷新后再收藏；业务入口仍可使用')
      })
    return () => {
      cancelled = true
    }
  }, [onError])

  const saveWorkspacePreference = useCallback(async (
    next: Pick<WorkspacePreferenceValue, 'mode' | 'layout' | 'pinned'>,
  ) => {
    if (!readyRef.current || savingRef.current) throw new Error('个人工作台设置正在加载或保存，请稍后重试')
    savingRef.current = true
    setSaving(true)
    try {
      await saveWorkspacePreferenceRequest(next)
      setWorkspacePreference((current) => ({ ...current, ...next }))
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存工作台设置失败'
      onError(message)
      throw new Error(message)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
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
    void recordWorkspaceUsageRequest(functionKey).catch(() => undefined)
  }, [])

  return {
    workspacePreference,
    saveWorkspacePreference,
    recordWorkspaceUsage,
    workspacePreferenceBusy: !ready || saving,
  }
}
