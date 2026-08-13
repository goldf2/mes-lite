import { normalizeContrastMode } from '@/lib/contrast-modes'
import type { SystemAppearanceSettings } from '../contracts/system-settings'

async function readResponse(response: Response, fallbackMessage: string): Promise<SystemAppearanceSettings> {
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || fallbackMessage)
  return {
    contrastMode: normalizeContrastMode(payload.data?.contrastMode),
    aiLoadingIndicatorEnabled: payload.data?.aiLoadingIndicatorEnabled !== false,
  }
}

export async function loadSystemAppearanceSettings(scope: 'display' | 'ai' = 'display') {
  return readResponse(await fetch(`/api/system/settings?scope=${scope}`), '获取系统外观设置失败')
}

export async function updateSystemAppearanceSettings(patch: Partial<SystemAppearanceSettings>, scope: 'display' | 'ai' = 'display') {
  return readResponse(await fetch(`/api/system/settings?scope=${scope}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }), '保存系统外观设置失败')
}
