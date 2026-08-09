import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { processCategories, processTemplateInputSchema } from '@/modules/production/contracts/production-engineering-schema'
import {
  createProcessTemplate,
  listProcessTemplates,
  ProductionEngineeringNotFoundError,
  updateProcessTemplate,
} from '@/modules/production/server/production-engineering-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await requireResourcePermission('system', 'read')
  if (denied) return denied
  return NextResponse.json({ data: await listProcessTemplates(), categories: processCategories })
}

export async function POST(req: NextRequest) {
  const denied = await requireResourcePermission('system', 'create')
  if (denied) return denied
  try {
    const template = await createProcessTemplate(processTemplateInputSchema.parse(await req.json()))
    await writeAuditLog(req, { action: 'CREATE', entityType: 'PROCESS_TEMPLATE', entityId: template.id, entityLabel: `${template.code} ${template.name}`, afterData: template })
    return NextResponse.json({ data: template }, { status: 201 })
  } catch (error) {
    return processTemplateError(error, 'create')
  }
}

export async function PUT(req: NextRequest) {
  const denied = await requireResourcePermission('system', 'update')
  if (denied) return denied
  try {
    const body = await req.json()
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) return NextResponse.json({ error: '参数错误', details: [{ message: '缺少加工工艺模板 ID' }] }, { status: 400 })
    const { before, template } = await updateProcessTemplate(id, processTemplateInputSchema.parse(body))
    await writeAuditLog(req, { action: 'UPDATE', entityType: 'PROCESS_TEMPLATE', entityId: template.id, entityLabel: `${template.code} ${template.name}`, beforeData: before, afterData: template })
    return NextResponse.json({ data: template })
  } catch (error) {
    return processTemplateError(error, 'update')
  }
}

function processTemplateError(error: unknown, operation: 'create' | 'update') {
  if (error instanceof ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
  if (error instanceof ProductionEngineeringNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 })
  console.error(`${operation === 'create' ? 'Create' : 'Update'} process template error:`, error)
  return NextResponse.json({ error: operation === 'create' ? '新增加工工艺模板失败，请检查编码是否重复' : '更新加工工艺模板失败' }, { status: 500 })
}
