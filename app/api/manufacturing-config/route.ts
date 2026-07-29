import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const nullableNonnegative = z.number().finite().nonnegative().nullable().optional()
const configSchema = z.object({
  requireIndividualMeasurement: z.boolean().nullable().optional(),
  allowMixedOrders: z.boolean().nullable().optional(),
  kerfMm: nullableNonnegative,
  headTrimMm: nullableNonnegative,
  tailTrimMm: nullableNonnegative,
  clampDeadZoneMm: nullableNonnegative,
  minReusableRemnantLengthMm: nullableNonnegative,
})

export async function GET() {
  try {
    const denied = await requireResourcePermission('cuttingPlans', 'read')
    if (denied) return denied
    const config = await prisma.manufacturingConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', allowNegativeStock: false },
      update: {},
    })
    return NextResponse.json({ data: config })
  } catch (error) {
    console.error('Get manufacturing config error:', error)
    return NextResponse.json({ error: '获取制造参数失败' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('cuttingPlans', 'update')
    if (denied) return denied
    const input = configSchema.parse(await req.json())
    const before = await prisma.manufacturingConfig.findUnique({ where: { id: 'default' } })
    const config = await prisma.manufacturingConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...input, allowNegativeStock: false },
      update: { ...input, allowNegativeStock: false },
    })
    await writeAuditLog(req, {
      action: before ? 'UPDATE' : 'CREATE',
      entityType: 'MANUFACTURING_CONFIG',
      entityId: 'default',
      entityLabel: '制造参数',
      beforeData: before,
      afterData: config,
    })
    return NextResponse.json({ data: config, message: '制造参数已保存' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    console.error('Save manufacturing config error:', error)
    return NextResponse.json({ error: '保存制造参数失败' }, { status: 500 })
  }
}
