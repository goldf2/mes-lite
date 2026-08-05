'use client'

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { AiAssistantMarkConfig, normalizeAiAssistantMarkConfig } from '@/lib/ai-assistant-mark'

interface AiAssistantAppearanceContextValue {
  config: AiAssistantMarkConfig
  loadingIndicatorEnabled: boolean
  setLoadingIndicatorEnabled: (enabled: boolean) => void
}

const AiAssistantAppearanceContext = createContext<AiAssistantAppearanceContextValue | null>(null)

export function AiAssistantAppearanceProvider({
  initialConfig,
  initialLoadingIndicatorEnabled,
  children,
}: {
  initialConfig: AiAssistantMarkConfig
  initialLoadingIndicatorEnabled: boolean
  children: ReactNode
}) {
  const [config, setConfig] = useState(() => normalizeAiAssistantMarkConfig(initialConfig))
  const [loadingIndicatorEnabled, setLoadingIndicatorEnabled] = useState(initialLoadingIndicatorEnabled)

  const updateLoadingIndicator = useCallback((enabled: boolean) => {
    setLoadingIndicatorEnabled(enabled)
  }, [])

  useEffect(() => {
    const receiveConfig = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'mes-ai-mark-config-updated') return
      setConfig(normalizeAiAssistantMarkConfig(event.data.config))
    }
    window.addEventListener('message', receiveConfig)
    return () => window.removeEventListener('message', receiveConfig)
  }, [])

  const value = useMemo(() => ({
    config,
    loadingIndicatorEnabled,
    setLoadingIndicatorEnabled: updateLoadingIndicator,
  }), [config, loadingIndicatorEnabled, updateLoadingIndicator])

  return (
    <AiAssistantAppearanceContext.Provider value={value}>
      {children}
    </AiAssistantAppearanceContext.Provider>
  )
}

export function useAiAssistantAppearance() {
  const value = useContext(AiAssistantAppearanceContext)
  if (!value) throw new Error('useAiAssistantAppearance must be used within AiAssistantAppearanceProvider')
  return value
}
