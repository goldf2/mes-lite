import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const categories = ['SAWING', 'DRILLING', 'TURNING', 'MILLING', 'GRINDING', 'HEAT_TREATMENT', 'SURFACE_TREATMENT', 'ASSEMBLY', 'INSPECTION', 'OTHER'] as const

const templateSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1, '模板编码必填'),
  name: z.string().min(1, '工艺名称必填'),
  category: z.enum(categories),
  defaultTime: z.number().int().nonnegative().optional(),
  workstation: z.string().optional(),
  description: z.string().optional(),
  materialIds: z.array(z.string()).default([]),
})

const include = {
  materials: { select: { id: true, code: true, name: true } },
} as const

export async function GET() {
  const denied = await requireResourcePermission('system', 'read')
  if (denied) return denied
  const templates = await prisma.processTemplate.findMany({
    include,
    orderBy: [{ isPreset: 'desc' }, { category: 'asc' }, { code: 'asc' }],
  })
  return NextResponse.json({ data: templates, categories })
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'create')
    if (denied) return denied
    const data = templateSchema.parse(await req.json())
    const template = await prisma.processTemplate.create({
      data: {
        code: data.code,
        name: data.name,
        category: data.category,
        defaultTime: data.defaultTime ?? null,
        workstation: data.workstation || null,
        description: data.description || null,
        materials: { connect: data.materialIds.map((id) => ({ id })) },
      },
      include,
    })
    await writeAuditLog(req, { action: 'CREATE', entityType: 'PROCESS_TEMPLATE', entityId: template.id, entityLabel: `${template.code} ${template.name}`, afterData: template })
    return NextResponse.json({ data: template }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    console.error('Create process template error:', error)
    return NextResponse.json({ error: '新增加工工艺模板失败，请检查编码是否重复' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'update')
    if (denied) return denied
    const data = templateSchema.extend({ id: z.string().min(1) }).parse(await req.json())
    const before = await prisma.processTemplate.findUnique({ where: { id: data.id }, include })
    if (!before) return NextResponse.json({ error: '加工工艺模板不存在' }, { status: 404 })
    const template = await prisma.processTemplate.update({
      where: { id: data.id },
      data: {
        code: data.code,
        name: data.name,
        category: data.category,
        defaultTime: data.defaultTime ?? null,
        workstation: data.workstation || null,
        description: data.description || null,
        materials: { set: data.materialIds.map((id) => ({ id })) },
      },
      include,
    })
    await writeAuditLog(req, { action: 'UPDATE', entityType: 'PROCESS_TEMPLATE', entityId: template.id, entityLabel: `${template.code} ${template.name}`, beforeData: before, afterData: template })
    return NextResponse.json({ data: template })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    console.error('Update process template error:', error)
    return NextResponse.json({ error: '更新加工工艺模板失败' }, { status: 500 })
  }
}
