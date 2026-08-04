import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getAiAgentConfig,
  testAiAgentConnection,
  toPublicAiAgentConfig,
  updateAiAgentConfig,
} from '@/lib/ai-agent/config'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

function validProviderUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:') return true
    return process.env.NODE_ENV !== 'production'
      && url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch (error) {
    return false
  }
}

const updateSchema = z.object({
  enabled: z.boolean(),
  providerName: z.string().trim().min(1).max(50),
  baseUrl: z.string().trim().min(1).max(500).refine(validProviderUrl),
  model: z.string().trim().max(120),
  timeoutMs: z.number().int().min(5000).max(120000),
  maxToolRounds: z.number().int().min(1).max(8),
  apiKey: z.string().trim().max(500).optional(),
  clearStoredApiKey: z.boolean().optional(),
})

function auditSnapshot(config: ReturnType<typeof toPublicAiAgentConfig>) {
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
    apiKeyConfigured: config.apiKeyConfigured,
  }
}

export async function GET() {
  const denied = await requireResourcePermission('system', 'read')
  if (denied) return denied
  try {
    return NextResponse.json({ data: toPublicAiAgentConfig(await getAiAgentConfig()) })
  } catch (error) {
    console.error('Get AI agent config error', error)
    return NextResponse.json({ error: '获取 AI 配置失败' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await requireResourcePermission('system', 'update')
  if (denied) return denied
  try {
    const parsed = updateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'AI 配置格式无效；生产环境接口地址必须使用 HTTPS' }, { status: 400 })
    }
    const before = toPublicAiAgentConfig(await getAiAgentConfig())
    const after = toPublicAiAgentConfig(await updateAiAgentConfig(parsed.data))
    await writeAuditLog(req, {
      action: 'UPDATE_AI_CONFIG',
      entityType: 'SYSTEM_SETTING',
      entityLabel: 'AI 助手配置',
      beforeData: auditSnapshot(before),
      afterData: auditSnapshot(after),
      note: `AI 助手：${after.enabled ? '启用' : '停用'}；提供商：${after.providerName}；密钥正文未记录`,
    })
    return NextResponse.json({ data: after })
  } catch (error) {
    if (error instanceof Error && error.message === 'AI_CONFIG_SECRET_REQUIRED') {
      return NextResponse.json({ error: '服务器尚未配置 AI_AGENT_CONFIG_SECRET，不能保存页面密钥' }, { status: 409 })
    }
    console.error('Update AI agent config error', error)
    return NextResponse.json({ error: '保存 AI 配置失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireResourcePermission('system', 'update')
  if (denied) return denied
  try {
    const result = await testAiAgentConnection()
    await writeAuditLog(req, {
      action: 'TEST_AI_CONFIG',
      entityType: 'SYSTEM_SETTING',
      entityLabel: 'AI 助手配置',
      afterData: result,
      note: 'AI 提供商连接测试通过；未记录密钥和测试响应正文',
    })
    return NextResponse.json({ data: result })
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'AI_AGENT_DISABLED') return NextResponse.json({ error: 'AI 助手当前已停用' }, { status: 409 })
    if (code === 'AI_AGENT_NOT_CONFIGURED') return NextResponse.json({ error: '请先保存模型和 API 密钥' }, { status: 409 })
    if (code === 'AI_PROVIDER_TIMEOUT') return NextResponse.json({ error: 'AI 服务连接超时' }, { status: 504 })
    if (code === 'AI_PROVIDER_REJECTED') return NextResponse.json({ error: 'AI 服务拒绝请求，请检查接口地址、模型和密钥' }, { status: 502 })
    if (code === 'AI_PROVIDER_INVALID_RESPONSE') return NextResponse.json({ error: 'AI 服务响应格式不兼容' }, { status: 502 })
    return NextResponse.json({ error: '无法连接 AI 服务' }, { status: 502 })
  }
}
