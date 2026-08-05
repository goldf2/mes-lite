import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { getSystemSettings, updateSystemSettings } from '@/lib/system-settings'

export const dynamic = 'force-dynamic'

const updateSchema = z.object({
  naturalMaterialCodeSortEnabled: z.boolean().optional(),
  companyName: z.string().max(100).optional(),
  companyContact: z.string().max(50).optional(),
  companyPhone: z.string().max(50).optional(),
  companyAddress: z.string().max(200).optional(),
})

export async function GET() {
  try {
    const denied = await requireResourcePermission('system', 'read')
    if (denied) return denied

    return NextResponse.json({ data: await getSystemSettings() })
  } catch (error) {
    console.error('Get system settings error:', error)
    return NextResponse.json({ error: '获取系统设置失败' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'update')
    if (denied) return denied

    const body = updateSchema.safeParse(await req.json())
    if (!body.success) {
      return NextResponse.json({ error: '系统设置格式无效' }, { status: 400 })
    }

    const before = await getSystemSettings()
    const after = await updateSystemSettings({ ...before, ...body.data })

    await writeAuditLog(req, {
      action: 'UPDATE_SETTINGS',
      entityType: 'SYSTEM_SETTING',
      entityLabel: '系统设置',
      beforeData: before,
      afterData: after,
      note: '更新系统设置及发货单供货方资料',
    })

    return NextResponse.json({ data: after })
  } catch (error) {
    console.error('Update system settings error:', error)
    return NextResponse.json({ error: '保存系统设置失败' }, { status: 500 })
  }
}
