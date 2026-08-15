import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentOperator } from '@/lib/auth'
import { workspaceUsageInputSchema } from '@/modules/workspace/contracts/workspace-preferences'
import { recordWorkspaceUsage } from '@/modules/workspace/server/workspace-preference-service'

export async function POST(req: Request) {
  // audit-exempt: 仅记录当前人员的功能使用频次，避免把界面遥测写入业务审计流。
  const operator = await getCurrentOperator()
  if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
  try {
    const { functionKey } = workspaceUsageInputSchema.parse(await req.json())
    return NextResponse.json({ data: await recordWorkspaceUsage(operator.id, functionKey) })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '功能标识不合法', details: error.issues }, { status: 400 })
    console.error('Record workspace usage error:', error)
    return NextResponse.json({ error: '记录功能使用失败' }, { status: 500 })
  }
}
