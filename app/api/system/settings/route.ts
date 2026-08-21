import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { BUSINESS_DOCUMENT_PRINT_DENSITIES, getSystemSettings, updateSystemSettings } from '@/lib/system-settings'
import { CONTRAST_MODE_VALUES } from '@/lib/contrast-modes'
import { CAD_PREVIEW_ENGINES } from '@/lib/cad-preview-engines'
import { checkCadPreviewService } from '@/lib/files/cad-document-preview'

export const dynamic = 'force-dynamic'

const businessUpdateSchema = z.object({
  naturalMaterialCodeSortEnabled: z.boolean().optional(),
  companyName: z.string().max(100).optional(),
  companyContact: z.string().max(50).optional(),
  companyPhone: z.string().max(50).optional(),
  companyAddress: z.string().max(200).optional(),
  businessDocumentPrintDensity: z.enum(BUSINESS_DOCUMENT_PRINT_DENSITIES).optional(),
  businessDocumentPrintMarginMm: z.number().int().min(8).max(20).optional(),
})
const displayUpdateSchema = z.object({
  contrastMode: z.enum(CONTRAST_MODE_VALUES).optional(),
})
const aiAppearanceUpdateSchema = z.object({
  aiLoadingIndicatorEnabled: z.boolean().optional(),
})
const cadPreviewUpdateSchema = z.object({
  cadPreviewEngine: z.enum(CAD_PREVIEW_ENGINES),
})
const scopeSchema = z.enum(['business', 'display', 'ai', 'cadPreview'])
const resourceByScope = { business: 'businessSettings', display: 'displaySettings', ai: 'aiSettings', cadPreview: 'cadPreviewSettings' } as const
const updateSchemaByScope = { business: businessUpdateSchema, display: displayUpdateSchema, ai: aiAppearanceUpdateSchema, cadPreview: cadPreviewUpdateSchema }

async function scopedSettings(scope: z.infer<typeof scopeSchema>, settings: Awaited<ReturnType<typeof getSystemSettings>>) {
  if (scope === 'business') return {
    naturalMaterialCodeSortEnabled: settings.naturalMaterialCodeSortEnabled,
    companyName: settings.companyName, companyContact: settings.companyContact,
    companyPhone: settings.companyPhone, companyAddress: settings.companyAddress,
    businessDocumentPrintDensity: settings.businessDocumentPrintDensity,
    businessDocumentPrintMarginMm: settings.businessDocumentPrintMarginMm,
  }
  if (scope === 'display') return { contrastMode: settings.contrastMode }
  if (scope === 'ai') return { aiLoadingIndicatorEnabled: settings.aiLoadingIndicatorEnabled }
  return { engine: settings.cadPreviewEngine, service: await checkCadPreviewService() }
}

export async function GET(req: NextRequest) {
  try {
    const scope = scopeSchema.parse(req.nextUrl.searchParams.get('scope'))
    const denied = await requireResourcePermission(resourceByScope[scope], 'read')
    if (denied) return denied

    return NextResponse.json({ data: await scopedSettings(scope, await getSystemSettings()) })
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

    if (scope === 'cadPreview') {
      const selectedEngine = (body.data as z.infer<typeof cadPreviewUpdateSchema>).cadPreviewEngine
      if (selectedEngine !== 'auto') {
        const service = await checkCadPreviewService()
        const selectedStatus = service.engines.find((item) => item.engine === selectedEngine)
        if (!service.available || selectedStatus?.available !== true) {
          return NextResponse.json({ error: '所选 CAD 预览引擎当前不可用，请先完成服务端安装或选择其他引擎' }, { status: 422 })
        }
      }
    }

    const before = await getSystemSettings()
    const after = await updateSystemSettings({ ...before, ...body.data })

    await writeAuditLog(req, {
      action: 'UPDATE_SETTINGS',
      entityType: 'SYSTEM_SETTING',
      entityLabel: '系统设置',
      beforeData: before,
      afterData: after,
      note: scope === 'cadPreview' ? '更新 CAD 预览转换引擎' : '更新企业资料、业务规则或业务单据打印格式',
    })

    return NextResponse.json({ data: await scopedSettings(scope, after) })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '系统设置范围无效' }, { status: 400 })
    console.error('Update system settings error:', error)
    return NextResponse.json({ error: '保存系统设置失败' }, { status: 500 })
  }
}
