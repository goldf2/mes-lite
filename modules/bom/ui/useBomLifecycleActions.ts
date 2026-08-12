'use client'

import { useCallback } from 'react'
import { BomApiError, copyBomVersion, obsoleteBom, releaseBom } from '../client'
import type { BomVersion } from '../contracts'

export default function useBomLifecycleActions({
  selectedBom,
  dirty,
  setSaving,
  onMessage,
  onAfterSave,
}: {
  selectedBom: BomVersion | null
  dirty: boolean
  setSaving: (saving: boolean) => void
  onMessage: (message: string) => void
  onAfterSave?: (preferredBomId?: string) => Promise<void> | void
}) {
  const run = useCallback(async (
    action: () => Promise<{ id?: string; message: string }>,
    fallback: string,
    preferredBomId?: string,
  ) => {
    setSaving(true)
    try {
      const result = await action()
      onMessage(result.message)
      await onAfterSave?.(result.id || preferredBomId)
      return true
    } catch (error) {
      onMessage(error instanceof BomApiError ? error.message : fallback)
      return false
    } finally {
      setSaving(false)
    }
  }, [onAfterSave, onMessage, setSaving])

  const release = useCallback(async () => {
    if (!selectedBom || selectedBom.status !== 'DRAFT') return false
    if (dirty) {
      onMessage('发布前请先保存当前修改')
      return false
    }
    return run(() => releaseBom(selectedBom.id), '发布 BOM 失败', selectedBom.id)
  }, [dirty, onMessage, run, selectedBom])

  const copyVersion = useCallback(async () => {
    if (!selectedBom) return false
    return run(() => copyBomVersion(selectedBom.id), '创建 BOM 新版本失败')
  }, [run, selectedBom])

  const obsolete = useCallback(async () => {
    if (!selectedBom || selectedBom.status !== 'RELEASED') return false
    return run(() => obsoleteBom(selectedBom.id), '作废 BOM 失败', selectedBom.id)
  }, [run, selectedBom])

  return { release, copyVersion, obsolete }
}
