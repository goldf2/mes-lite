import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const profileSpecSchema = z.object({
  materialId: z.string().min(1, '物料必填'),
  sectionDescription: z.string().trim().optional(),
  alloyGrade: z.string().trim().optional(),
  temper: z.string().trim().optional(),
  surfaceTreatment: z.string().trim().optional(),
  drawingNo: z.string().trim().optional(),
  densityKgPerMeter: z.number().positive('理论米重必须大于 0').nullable().optional(),
  trackingMode: z.enum(['BATCH', 'SINGLE']).default('BATCH'),
})

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('profileStock', 'read')
    if (denied) return denied

    const materialId = new URL(req.url).searchParams.get('materialId')
    const specs = await prisma.profileSpec.findMany({
      where: materialId ? { materialId } : undefined,
      include: {
        material: {
          select: {
            id: true,
            code: true,
            name: true,
            spec: true,
            stockUnit: true,
            valuationUnit: true,
            deletedAt: true,
          },
        },
      },
      orderBy: { material: { code: 'asc' } },
    })
    return NextResponse.json({ data: specs.filter((item) => !item.material.deletedAt) })
  } catch (error) {
    console.error('Get profile specs error:', error)
    return NextResponse.json({ error: '获取型材规格失败' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('profileStock', 'update')
    if (denied) return denied

    const input = profileSpecSchema.parse(await req.json())
    const material = await prisma.material.findFirst({
      where: { id: input.materialId, deletedAt: null },
    })
    if (!material) return NextResponse.json({ error: '物料不存在或已归档' }, { status: 404 })

    const before = await prisma.profileSpec.findUnique({ where: { materialId: input.materialId } })
    const data = {
      sectionDescription: input.sectionDescription || null,
      alloyGrade: input.alloyGrade || null,
      temper: input.temper || null,
      surfaceTreatment: input.surfaceTreatment || null,
      drawingNo: input.drawingNo || null,
      densityKgPerMeter: input.densityKgPerMeter ?? null,
      trackingMode: input.trackingMode,
    }
    const saved = await prisma.profileSpec.upsert({
      where: { materialId: input.materialId },
      create: { materialId: input.materialId, ...data },
      update: data,
      include: { material: true },
    })

    await writeAuditLog(req, {
      action: before ? 'UPDATE' : 'CREATE',
      entityType: 'PROFILE_SPEC',
      entityId: saved.id,
      entityLabel: material.code,
      beforeData: before,
      afterData: saved,
    })
    return NextResponse.json({ data: saved, message: '型材规格已保存' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    console.error('Save profile spec error:', error)
    return NextResponse.json({ error: '保存型材规格失败' }, { status: 500 })
  }
}
