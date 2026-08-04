const DEFAULT_QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

export interface AiAgentConfig {
  enabled: boolean
  configured: boolean
  providerName: string
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
  maxToolRounds: number
}

export function getAiAgentConfig(): AiAgentConfig {
  const apiKey = process.env.AI_AGENT_API_KEY?.trim() || ''
  const model = process.env.AI_AGENT_MODEL?.trim() || ''
  const enabled = process.env.AI_AGENT_ENABLED !== 'false'

  return {
    enabled,
    configured: enabled && Boolean(apiKey && model),
    providerName: process.env.AI_AGENT_PROVIDER_NAME?.trim() || '国产模型',
    baseUrl: (process.env.AI_AGENT_BASE_URL?.trim() || DEFAULT_QWEN_BASE_URL).replace(/\/$/, ''),
    apiKey,
    model,
    timeoutMs: boundedNumber(process.env.AI_AGENT_TIMEOUT_MS, 45000, 5000, 120000),
    maxToolRounds: boundedNumber(process.env.AI_AGENT_MAX_TOOL_ROUNDS, 4, 1, 8),
  }
}
