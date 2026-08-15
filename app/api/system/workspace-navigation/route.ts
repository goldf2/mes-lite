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

const moduleButtonSchema = z.object({
  visible: z.boolean(),
  label: z.string().trim().max(20),
})

const updateSchema = z.object({
  version: z.literal(1).optional(),
  defaultWorkspace: z.enum(navigationWorkspaceIds),
  moduleButtons: z.object({
    mes: moduleButtonSchema,
    mrp: moduleButtonSchema,
    erp: moduleButtonSchema,
  }).optional(),
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
    return NextResponse.json({ error: '获取导航菜单配置失败' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const denied = await requireResourcePermission('navigationSettings', 'update')
  if (denied) return denied

  try {
    const parsed = updateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: '导航菜单配置格式无效', details: parsed.error.issues }, { status: 400 })
    }

    const before = await getWorkspaceNavigationConfig()
    const after = await saveWorkspaceNavigationConfig(parsed.data)
    await writeAuditLog(req, {
      action: 'UPDATE_SETTINGS',
      entityType: 'WORKSPACE_NAVIGATION',
      entityLabel: 'MES-lite 混合系统导航',
      beforeData: before,
      afterData: after,
      note: '更新统一 MES 工作台的模块按钮、一级菜单顺序、页面显示名称和顺序',
    })
    return NextResponse.json({ data: after, message: '导航菜单配置已发布' })
  } catch (error) {
    console.error('Save workspace navigation error:', error)
    return NextResponse.json({ error: '保存导航菜单配置失败' }, { status: 500 })
  }
}
