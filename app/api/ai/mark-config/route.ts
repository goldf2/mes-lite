import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { getPublishedAiAssistantMarkConfig, publishAiAssistantMarkConfig } from '@/lib/ai-assistant-mark-settings'

export const dynamic = 'force-dynamic'

const publishSchema = z.object({
  config: z.record(z.unknown()),
})

export async function GET() {
  try {
    const data = await getPublishedAiAssistantMarkConfig()
    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Get AI assistant mark config error:', error)
    return NextResponse.json({ error: '获取 AI 图标配置失败' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'update')
    if (denied) return denied

    const body = publishSchema.safeParse(await req.json())
    if (!body.success) {
      return NextResponse.json({ error: 'AI 图标配置格式无效' }, { status: 400 })
    }

    const before = await getPublishedAiAssistantMarkConfig()
    const after = await publishAiAssistantMarkConfig(body.data.config)
    await writeAuditLog(req, {
      action: 'UPDATE_AI_ASSISTANT_MARK',
      entityType: 'SYSTEM_SETTING',
      entityLabel: 'AI 助手图标',
      beforeData: before,
      afterData: after,
      note: '从图标参数实验室应用系统级图标配置',
    })

    return NextResponse.json({ data: after })
  } catch (error) {
    console.error('Publish AI assistant mark config error:', error)
    return NextResponse.json({ error: '应用 AI 图标配置失败' }, { status: 500 })
  }
}
