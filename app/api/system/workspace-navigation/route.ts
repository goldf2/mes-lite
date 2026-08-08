import { NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { navigationWorkspaceIds, workspaceNavigationGroupKeys } from '@/lib/workspace-navigation-config'
import { getWorkspaceNavigationConfig, saveWorkspaceNavigationConfig } from '@/lib/workspace-navigation-settings'

export const dynamic = 'force-dynamic'

const itemSchema = z.object({
  functionKey: z.string().min(1).max(80),
  label: z.string().trim().max(20).optional(),
})

const workspaceSchema = z.object({
  enabled: z.boolean(),
  groupOrder: z.array(z.enum(workspaceNavigationGroupKeys)).max(workspaceNavigationGroupKeys.length).optional(),
  items: z.array(itemSchema).max(60),
})

const updateSchema = z.object({
  version: z.literal(1).optional(),
  defaultWorkspace: z.enum(navigationWorkspaceIds),
  workspaces: z.object({
    mes: workspaceSchema,
    mrp: workspaceSchema,
    erp: workspaceSchema,
  }),
})

export async function GET() {
  const operator = await getCurrentOperator()
  if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  try {
    return NextResponse.json({ data: await getWorkspaceNavigationConfig() })
  } catch (error) {
    console.error('Get workspace navigation error:', error)
    return NextResponse.json({ error: '获取工作区菜单配置失败' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const denied = await requireResourcePermission('system', 'update')
  if (denied) return denied

  try {
    const parsed = updateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: '工作区菜单配置格式无效', details: parsed.error.issues }, { status: 400 })
    }

    const before = await getWorkspaceNavigationConfig()
    const after = await saveWorkspaceNavigationConfig(parsed.data)
    await writeAuditLog(req, {
      action: 'UPDATE_SETTINGS',
      entityType: 'WORKSPACE_NAVIGATION',
      entityLabel: 'MES/MRP/ERP 工作区菜单',
      beforeData: before,
      afterData: after,
      note: '更新工作区启用状态、一级菜单顺序、页面唯一归属、显示名称和顺序',
    })
    return NextResponse.json({ data: after, message: '工作区菜单配置已发布' })
  } catch (error) {
    console.error('Save workspace navigation error:', error)
    return NextResponse.json({ error: '保存工作区菜单配置失败' }, { status: 500 })
  }
}
