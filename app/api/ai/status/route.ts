import { NextResponse } from 'next/server'
import { getCurrentOperator } from '@/lib/auth'
import { getAiAgentConfig } from '@/lib/ai-agent/config'
import { getAvailableAgentToolNames } from '@/lib/ai-agent/tools'
import { getEffectivePermissionMap, hasResourcePermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET() {
  const operator = await getCurrentOperator()
  if (!operator || !(await hasResourcePermission(operator, 'aiAssistant', 'read'))) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const config = await getAiAgentConfig()
  const permissions = await getEffectivePermissionMap(operator)
  return NextResponse.json({
    data: {
      enabled: config.enabled,
      configured: config.configured,
      providerName: config.providerName,
      model: config.configured ? config.model : null,
      mode: 'READ_ONLY',
      tools: getAvailableAgentToolNames(permissions),
    },
  })
}
