import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runAiAgent } from '@/lib/ai-agent/agent'
import { writeAuditLog } from '@/lib/audit'
import { getCurrentOperator } from '@/lib/auth'
import { getEffectivePermissionMap, hasResourcePermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const requestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(4000),
  })).min(1).max(16),
  context: z.object({
    key: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(80),
  }),
})

const rateBuckets = new Map<string, { startedAt: number; count: number }>()
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 20

function rateLimited(operatorId: string) {
  const now = Date.now()
  const current = rateBuckets.get(operatorId)
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(operatorId, { startedAt: now, count: 1 })
    return false
  }
  current.count += 1
  return current.count > RATE_LIMIT
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : ''
  if (code === 'AI_AGENT_DISABLED') return NextResponse.json({ error: 'AI 助手已停用' }, { status: 503 })
  if (code === 'AI_AGENT_NOT_CONFIGURED') return NextResponse.json({ error: 'AI 服务尚未配置，请联系管理员' }, { status: 503 })
  if (code === 'AI_PROVIDER_TIMEOUT') return NextResponse.json({ error: 'AI 响应超时，请稍后重试' }, { status: 504 })
  if (code === 'AI_PROVIDER_UNREACHABLE') return NextResponse.json({ error: '暂时无法连接 AI 服务' }, { status: 502 })
  if (code === 'AI_TOOL_ROUND_LIMIT') return NextResponse.json({ error: '本次查询步骤较多，请缩小问题范围后重试' }, { status: 422 })
  return NextResponse.json({ error: 'AI 服务暂时不可用' }, { status: 502 })
}

export async function POST(req: NextRequest) {
  const operator = await getCurrentOperator()
  if (!operator || !(await hasResourcePermission(operator, 'aiAssistant', 'read'))) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }
  if (rateLimited(operator.id)) {
    return NextResponse.json({ error: '请求过于频繁，请稍后再试' }, { status: 429 })
  }

  try {
    const parsed = requestSchema.parse(await req.json())
    const totalCharacters = parsed.messages.reduce((sum, message) => sum + message.content.length, 0)
    if (totalCharacters > 20_000) {
      return NextResponse.json({ error: '当前对话过长，请清空后重新提问' }, { status: 413 })
    }

    const permissions = await getEffectivePermissionMap(operator)
    const result = await runAiAgent({
      messages: parsed.messages,
      context: parsed.context,
      permissions,
    })
    await writeAuditLog(req, {
      action: 'QUERY',
      entityType: 'AI_AGENT',
      entityLabel: 'AI 只读业务查询',
      afterData: {
        page: parsed.context,
        tools: result.usedTools,
        sources: result.sources,
        provider: result.providerName,
        model: result.model,
      },
      note: '未记录用户问题和模型回答正文',
    })
    return NextResponse.json({
      data: {
        message: result.content,
        sources: result.sources,
        providerName: result.providerName,
        model: result.model,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '提问参数不完整' }, { status: 400 })
    }
    console.error('AI agent chat error', error)
    return errorResponse(error)
  }
}
