import { prisma } from './prisma'
import { AiAssistantMarkConfig, defaultAiAssistantMarkConfig, normalizeAiAssistantMarkConfig } from './ai-assistant-mark'

export const AI_ASSISTANT_MARK_CONFIG_KEY = 'ai.assistantMark.config'

export interface PublishedAiAssistantMarkConfig {
  config: AiAssistantMarkConfig
  configured: boolean
  updatedAt: string | null
}

export async function getPublishedAiAssistantMarkConfig(): Promise<PublishedAiAssistantMarkConfig> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: AI_ASSISTANT_MARK_CONFIG_KEY },
    select: { value: true, updatedAt: true },
  })
  if (!row) {
    return {
      config: normalizeAiAssistantMarkConfig(defaultAiAssistantMarkConfig),
      configured: false,
      updatedAt: null,
    }
  }

  try {
    return {
      config: normalizeAiAssistantMarkConfig(JSON.parse(row.value)),
      configured: true,
      updatedAt: row.updatedAt.toISOString(),
    }
  } catch (error) {
    return {
      config: normalizeAiAssistantMarkConfig(defaultAiAssistantMarkConfig),
      configured: false,
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}

export async function publishAiAssistantMarkConfig(value: unknown): Promise<PublishedAiAssistantMarkConfig> {
  const config = normalizeAiAssistantMarkConfig(value)
  const row = await prisma.systemSetting.upsert({
    where: { key: AI_ASSISTANT_MARK_CONFIG_KEY },
    create: { key: AI_ASSISTANT_MARK_CONFIG_KEY, value: JSON.stringify(config) },
    update: { value: JSON.stringify(config) },
    select: { updatedAt: true },
  })
  return { config, configured: true, updatedAt: row.updatedAt.toISOString() }
}
