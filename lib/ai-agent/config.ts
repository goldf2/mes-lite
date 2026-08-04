import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

export const AI_AGENT_CONFIG_SETTING_KEY = 'ai.agent.config.v1'
export const DEFAULT_QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

type SettingsClient = PrismaClient | Prisma.TransactionClient

const storedConfigSchema = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  providerName: z.string().trim().min(1).max(50),
  baseUrl: z.string().trim().min(1).max(500),
  model: z.string().trim().max(120),
  timeoutMs: z.number().int().min(5000).max(120000),
  maxToolRounds: z.number().int().min(1).max(8),
  apiKeyCiphertext: z.string().optional(),
})

type StoredAiAgentConfig = z.infer<typeof storedConfigSchema>

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function encryptionKey() {
  const secret = process.env.AI_AGENT_CONFIG_SECRET?.trim()
  if (!secret) return null
  return createHash('sha256').update(`mes-lite:ai-agent:${secret}`).digest()
}

function encryptApiKey(value: string) {
  const key = encryptionKey()
  if (!key) throw new Error('AI_CONFIG_SECRET_REQUIRED')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

function decryptApiKey(value: string) {
  const key = encryptionKey()
  if (!key) throw new Error('AI_CONFIG_SECRET_REQUIRED')
  const [version, ivValue, tagValue, encryptedValue] = value.split(':')
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) throw new Error('AI_CONFIG_DECRYPT_FAILED')
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64'))
    decipher.setAuthTag(Buffer.from(tagValue, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch (error) {
    throw new Error('AI_CONFIG_DECRYPT_FAILED')
  }
}

async function readStoredConfig(client: SettingsClient = prisma) {
  const setting = await client.systemSetting.findUnique({
    where: { key: AI_AGENT_CONFIG_SETTING_KEY },
    select: { value: true },
  })
  if (!setting) return null
  try {
    return storedConfigSchema.parse(JSON.parse(setting.value))
  } catch (error) {
    return null
  }
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
  source: 'PAGE' | 'ENV'
  apiKeySource: 'PAGE' | 'ENV' | 'NONE'
  storedApiKeyConfigured: boolean
  storageReady: boolean
  apiKeyError: 'MISSING_SECRET' | 'DECRYPT_FAILED' | null
}

export interface AiAgentConfigUpdate {
  enabled: boolean
  providerName: string
  baseUrl: string
  model: string
  timeoutMs: number
  maxToolRounds: number
  apiKey?: string
  clearStoredApiKey?: boolean
}

export interface PublicAiAgentConfig {
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

export async function getAiAgentConfig(client: SettingsClient = prisma): Promise<AiAgentConfig> {
  const stored = await readStoredConfig(client)
  const envApiKey = process.env.AI_AGENT_API_KEY?.trim() || ''
  let storedApiKey = ''
  let apiKeyError: AiAgentConfig['apiKeyError'] = null

  if (stored?.apiKeyCiphertext) {
    try {
      storedApiKey = decryptApiKey(stored.apiKeyCiphertext).trim()
    } catch (error) {
      apiKeyError = error instanceof Error && error.message === 'AI_CONFIG_SECRET_REQUIRED'
        ? 'MISSING_SECRET'
        : 'DECRYPT_FAILED'
    }
  }

  const enabled = stored?.enabled ?? process.env.AI_AGENT_ENABLED !== 'false'
  const model = stored?.model ?? process.env.AI_AGENT_MODEL?.trim() ?? ''
  const apiKey = storedApiKey || envApiKey

  return {
    enabled,
    configured: enabled && Boolean(apiKey && model),
    providerName: stored?.providerName || process.env.AI_AGENT_PROVIDER_NAME?.trim() || '国产模型',
    baseUrl: (stored?.baseUrl || process.env.AI_AGENT_BASE_URL?.trim() || DEFAULT_QWEN_BASE_URL).replace(/\/$/, ''),
    apiKey,
    model,
    timeoutMs: stored?.timeoutMs ?? boundedNumber(process.env.AI_AGENT_TIMEOUT_MS, 45000, 5000, 120000),
    maxToolRounds: stored?.maxToolRounds ?? boundedNumber(process.env.AI_AGENT_MAX_TOOL_ROUNDS, 4, 1, 8),
    source: stored ? 'PAGE' : 'ENV',
    apiKeySource: storedApiKey ? 'PAGE' : envApiKey ? 'ENV' : 'NONE',
    storedApiKeyConfigured: Boolean(stored?.apiKeyCiphertext),
    storageReady: Boolean(encryptionKey()),
    apiKeyError,
  }
}

export function toPublicAiAgentConfig(config: AiAgentConfig): PublicAiAgentConfig {
  const apiKeyHint = config.apiKeySource === 'PAGE' && config.apiKey
    ? `页面密钥已保存（末尾 ${config.apiKey.slice(-4)}）`
    : config.apiKeySource === 'ENV'
      ? '正在使用服务器环境变量中的密钥'
      : null
  return {
    enabled: config.enabled,
    configured: config.configured,
    providerName: config.providerName,
    baseUrl: config.baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
    maxToolRounds: config.maxToolRounds,
    source: config.source,
    apiKeySource: config.apiKeySource,
    apiKeyConfigured: Boolean(config.apiKey),
    storedApiKeyConfigured: config.storedApiKeyConfigured,
    apiKeyHint,
    storageReady: config.storageReady,
    apiKeyError: config.apiKeyError,
  }
}

export async function updateAiAgentConfig(
  input: AiAgentConfigUpdate,
  client: SettingsClient = prisma,
) {
  const current = await readStoredConfig(client)
  let apiKeyCiphertext = input.clearStoredApiKey ? undefined : current?.apiKeyCiphertext
  const nextApiKey = input.apiKey?.trim()
  if (nextApiKey) apiKeyCiphertext = encryptApiKey(nextApiKey)

  const stored: StoredAiAgentConfig = {
    version: 1,
    enabled: input.enabled,
    providerName: input.providerName.trim(),
    baseUrl: input.baseUrl.trim().replace(/\/$/, ''),
    model: input.model.trim(),
    timeoutMs: input.timeoutMs,
    maxToolRounds: input.maxToolRounds,
    apiKeyCiphertext,
  }
  await client.systemSetting.upsert({
    where: { key: AI_AGENT_CONFIG_SETTING_KEY },
    create: { key: AI_AGENT_CONFIG_SETTING_KEY, value: JSON.stringify(stored) },
    update: { value: JSON.stringify(stored) },
  })
  return getAiAgentConfig(client)
}

export async function testAiAgentConnection(providedConfig?: AiAgentConfig) {
  const config = providedConfig || await getAiAgentConfig()
  if (!config.enabled) throw new Error('AI_AGENT_DISABLED')
  if (!config.configured) throw new Error('AI_AGENT_NOT_CONFIGURED')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 30000))
  const startedAt = Date.now()
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: '仅回复 OK' }],
        max_tokens: 8,
        temperature: 0,
        stream: false,
      }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error('AI_PROVIDER_REJECTED')
    const payload = await response.json().catch(() => null) as { choices?: unknown[] } | null
    if (!payload?.choices?.length) throw new Error('AI_PROVIDER_INVALID_RESPONSE')
    return {
      providerName: config.providerName,
      model: config.model,
      latencyMs: Date.now() - startedAt,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('AI_PROVIDER_TIMEOUT')
    if (error instanceof Error && error.message.startsWith('AI_')) throw error
    throw new Error('AI_PROVIDER_UNREACHABLE')
  } finally {
    clearTimeout(timeout)
  }
}
