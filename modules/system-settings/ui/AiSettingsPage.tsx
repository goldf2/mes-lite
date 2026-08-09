'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAiAssistantAppearance } from '@/app/components/AiAssistantAppearanceProvider'
import { loadSystemAppearanceSettings, updateSystemAppearanceSettings } from '../client/system-settings-api'
import AiAgentSettingsPanel from './AiAgentSettingsPanel'
import SystemSettingsPageShell from './SystemSettingsPageShell'
import TogglePreferenceRow from './TogglePreferenceRow'

export default function AiSettingsPage({ onMessage }: { onMessage: (message: string) => void }) {
  const { loadingIndicatorEnabled, setLoadingIndicatorEnabled } = useAiAssistantAppearance()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setLoadingIndicatorEnabled((await loadSystemAppearanceSettings()).aiLoadingIndicatorEnabled)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取 AI 外观设置失败')
    } finally {
      setLoading(false)
    }
  }, [onMessage, setLoadingIndicatorEnabled])

  useEffect(() => { void load() }, [load])

  const saveLoadingIndicator = async (enabled: boolean) => {
    setSaving(true)
    try {
      const settings = await updateSystemAppearanceSettings({ aiLoadingIndicatorEnabled: enabled })
      setLoadingIndicatorEnabled(settings.aiLoadingIndicatorEnabled)
      onMessage(`页面加载图标已${enabled ? '开启' : '关闭'}`)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存页面加载图标设置失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SystemSettingsPageShell resourceKey="aiSettings" title="AI 服务" description="维护 AI 助手服务、模型连接、密钥和系统级助手外观。">
      <TogglePreferenceRow title="页面加载 AI 图标" description="开启后，刷新、鉴权和功能页等待时显示当前 AI 图标；关闭后仅显示加载文字。" hint="系统级 AI 外观，保存后对所有客户端生效。" enabled={loadingIndicatorEnabled} onChange={saveLoadingIndicator} disabled={loading || saving} />
      <AiAgentSettingsPanel onMessage={onMessage} />
    </SystemSettingsPageShell>
  )
}
