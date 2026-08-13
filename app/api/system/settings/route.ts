import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { getSystemSettings, updateSystemSettings } from '@/lib/system-settings'
import { CONTRAST_MODE_VALUES } from '@/lib/contrast-modes'

export const dynamic = 'force-dynamic'

const businessUpdateSchema = z.object({
  naturalMaterialCodeSortEnabled: z.boolean().optional(),
  companyName: z.string().max(100).optional(),
  companyContact: z.string().max(50).optional(),
  companyPhone: z.string().max(50).optional(),
  companyAddress: z.string().max(200).optional(),
})
const displayUpdateSchema = z.object({
  contrastMode: z.enum(CONTRAST_MODE_VALUES).optional(),
})
const aiAppearanceUpdateSchema = z.object({
  aiLoadingIndicatorEnabled: z.boolean().optional(),
})
const scopeSchema = z.enum(['business', 'display', 'ai'])
const resourceByScope = { business: 'businessSettings', display: 'displaySettings', ai: 'aiSettings' } as const
const updateSchemaByScope = { business: businessUpdateSchema, display: displayUpdateSchema, ai: aiAppearanceUpdateSchema }

function scopedSettings(scope: z.infer<typeof scopeSchema>, settings: Awaited<ReturnType<typeof getSystemSettings>>) {
  if (scope === 'business') return {
    naturalMaterialCodeSortEnabled: settings.naturalMaterialCodeSortEnabled,
    companyName: settings.companyName, companyContact: settings.companyContact,
    companyPhone: settings.companyPhone, companyAddress: settings.companyAddress,
  }
  if (scope === 'display') return { contrastMode: settings.contrastMode }
  return { aiLoadingIndicatorEnabled: settings.aiLoadingIndicatorEnabled }
}

export async function GET(req: NextRequest) {
  try {
    const scope = scopeSchema.parse(req.nextUrl.searchParams.get('scope'))
    const denied = await requireResourcePermission(resourceByScope[scope], 'read')
    if (denied) return denied

    return NextResponse.json({ data: scopedSettings(scope, await getSystemSettings()) })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '系统设置范围无效' }, { status: 400 })
    console.error('Get system settings error:', error)
    return NextResponse.json({ error: '获取系统设置失败' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const scope = scopeSchema.parse(req.nextUrl.searchParams.get('scope'))
    const denied = await requireResourcePermission(resourceByScope[scope], 'update')
    if (denied) return denied

    const body = updateSchemaByScope[scope].safeParse(await req.json())
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

    return NextResponse.json({ data: scopedSettings(scope, after) })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '系统设置范围无效' }, { status: 400 })
    console.error('Update system settings error:', error)
    return NextResponse.json({ error: '保存系统设置失败' }, { status: 500 })
  }
}
