import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentOperator } from '@/lib/auth'
import { workspacePreferenceInputSchema } from '@/modules/workspace/contracts/workspace-preferences'
import { getWorkspacePreference, saveWorkspacePreference } from '@/modules/workspace/server/workspace-preference-service'

export async function GET() {
  const operator = await getCurrentOperator()
  if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
  return NextResponse.json({ data: await getWorkspacePreference(operator.id) })
}

export async function PUT(req: Request) {
  // audit-exempt: 仅保存当前人员的界面偏好，不改变业务事实、权限或库存。
  const operator = await getCurrentOperator()
  if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
  try {
    const data = await saveWorkspacePreference(operator.id, workspacePreferenceInputSchema.parse(await req.json()))
    return NextResponse.json({ data, message: '工作台设置已保存' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '工作台设置不合法', details: error.issues }, { status: 400 })
    console.error('Save workspace preference error:', error)
    return NextResponse.json({ error: '保存工作台设置失败' }, { status: 500 })
  }
}
