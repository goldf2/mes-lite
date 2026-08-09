import type { ContrastMode } from '@/lib/contrast-modes'

export interface SystemAppearanceSettings {
  contrastMode: ContrastMode
  aiLoadingIndicatorEnabled: boolean
}

export interface AiAgentConfigView {
  enabled: boolean
  configured: boolean
  providerName: string
  baseUrl: string
  model: string
  timeoutMs: number
  maxToolRounds: number
  source: 'PAGE' | 'ENV'
  apiKeySource: 'PAGE' | 'ENV' | 'NONE'
  apiKeyConfigured: boolean
  storedApiKeyConfigured: boolean
  apiKeyHint: string | null
  storageReady: boolean
  apiKeyError: 'MISSING_SECRET' | 'DECRYPT_FAILED' | null
}

export interface AiAgentConfigPatch {
  enabled: boolean
  providerName: string
  baseUrl: string
  model: string
  timeoutMs: number
  maxToolRounds: number
  apiKey?: string
  clearStoredApiKey: boolean
}
