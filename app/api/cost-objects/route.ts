import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const number = z.number().finite().nonnegative()

const schema = z.object({
  code: z.string().trim().min(1, '成本对象编码必填'),
  name: z.string().trim().min(1, '成本对象名称必填'),
  objectType: z.string().trim().min(1).default('MANUAL'),
  unit: z.string().trim().min(1).default('件'),
  materialCostPerUnit: number.default(0),
  laborHoursPerUnit: number.default(0),
  machineHoursPerUnit: number.default(0),
  directCostPerUnit: number.default(0),
})

const costObjectInclude = {
  costs: {
    where: { active: true },
    orderBy: { effectiveFrom: 'desc' as const },
    take: 1,
  },
  bomItems: {
    select: {
      id: true,
      quantity: true,
      unit: true,
      bom: {
        select: {
          id: true,
          version: true,
          product: { select: { id: true, sku: true, name: true, unit: true } },
        },
      },
    },
  },
} as const

export async function GET() {
  const denied = await requireResourcePermission('bomCost', 'read')
  if (denied) return denied

  const [costObjects, processTemplates, products, recentRuns] = await Promise.all([
    prisma.costObject.findMany({
      include: costObjectInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.processTemplate.findMany({
      include: { materials: { select: { id: true, code: true, name: true } } },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
      take: 100,
    }),
    prisma.product.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
        unit: true,
        bom: {
          select: {
            id: true,
            version: true,
            isActive: true,
            items: {
              select: {
                id: true,
                itemType: true,
                quantity: true,
                unit: true,
                wastageRate: true,
                material: { select: { id: true, code: true, name: true, stockUnit: true, valuationUnit: true } },
                costObject: { select: { id: true, code: true, name: true, objectType: true, unit: true } },
                sawingScenario: { select: { id: true, name: true } },
              },
            },
          },
        },
        processRoutes: {
          where: { isDefault: true },
          select: {
            id: true,
            name: true,
            isDefault: true,
            steps: {
              where: { deletedAt: null },
              orderBy: { stepNo: 'asc' },
              select: {
                id: true,
                stepNo: true,
                name: true,
                templateCode: true,
                standardBatchQty: true,
                setupTimeMinutes: true,
                cycleTimeSeconds: true,
                peopleCount: true,
                laborRatePerHour: true,
                machineCount: true,
                machineRatePerHour: true,
                energyCostPerHour: true,
                consumableCostPerBatch: true,
                yieldRate: true,
              },
            },
          },
        },
        bomCostRuns: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, unitCost: true, totalCost: true, quantityBasis: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.bomCostRun.findMany({
      include: { product: { select: { id: true, sku: true, name: true, unit: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])

  return NextResponse.json({ costObjects, processTemplates, products, recentRuns })
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('bomCost', 'create')
    if (denied) return denied

    const data = schema.parse(await req.json())
    const costObject = await prisma.costObject.create({
      data: {
        code: data.code,
        name: data.name,
        objectType: data.objectType,
        unit: data.unit,
        costs: {
          create: {
            version: 'v1',
            materialCostPerUnit: data.materialCostPerUnit,
            laborHoursPerUnit: data.laborHoursPerUnit,
            machineHoursPerUnit: data.machineHoursPerUnit,
            directCostPerUnit: data.directCostPerUnit,
          },
        },
      },
      include: costObjectInclude,
    })

    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'COST_OBJECT',
      entityId: costObject.id,
      entityLabel: `${costObject.code} ${costObject.name}`,
      afterData: costObject,
    })

    return NextResponse.json({ data: costObject }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    console.error('Create cost object error:', error)
    return NextResponse.json({ error: '保存成本对象失败，请检查编码是否重复' }, { status: 500 })
  }
}
