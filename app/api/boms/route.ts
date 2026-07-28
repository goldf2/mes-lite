import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const bomItemSchema = z.object({
  materialId: z.string().min(1, '请选择物料'),
  quantity: z.number().finite().nonnegative(),
  unit: z.string().trim().optional(),
  wastageRate: z.number().finite().nonnegative().default(0),
})

const saveBomSchema = z.object({
  productId: z.string().min(1, '请选择产品'),
  items: z.array(bomItemSchema).max(200, 'BOM 明细过多'),
})

const bomItemSelect = {
  id: true,
  itemType: true,
  quantity: true,
  unit: true,
  wastageRate: true,
  material: {
    select: {
      id: true,
      code: true,
      name: true,
      spec: true,
      category: true,
      unit: true,
      stockUnit: true,
      valuationUnit: true,
    },
  },
  costObject: {
    select: {
      id: true,
      code: true,
      name: true,
      objectType: true,
      unit: true,
    },
  },
  sawingScenario: {
    select: {
      id: true,
      name: true,
    },
  },
} as const

export async function GET() {
  const denied = await requireResourcePermission('bomCost', 'read')
  if (denied) return denied

  const [products, materialOptions] = await Promise.all([
    prisma.product.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
        category: true,
        unit: true,
        customer: { select: { id: true, name: true } },
        bom: {
          select: {
            id: true,
            version: true,
            isActive: true,
            items: {
              orderBy: { id: 'asc' },
              select: bomItemSelect,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    prisma.material.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        spec: true,
        category: true,
        unit: true,
        stockUnit: true,
        valuationUnit: true,
      },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
      take: 1000,
    }),
  ])

  return NextResponse.json({ products, materialOptions })
}

export async function PUT(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('bomCost', 'update')
    if (denied) return denied

    const input = saveBomSchema.parse(await req.json())
    const product = await prisma.product.findUnique({ where: { id: input.productId } })
    if (!product) return NextResponse.json({ error: '产品不存在' }, { status: 404 })

    const materialIds = Array.from(new Set(input.items.map((item) => item.materialId)))
    const materials = await prisma.material.findMany({
      where: { id: { in: materialIds }, deletedAt: null },
      select: { id: true, stockUnit: true, unit: true },
    })
    if (materials.length !== materialIds.length) {
      return NextResponse.json({ error: 'BOM 中存在无效或已归档物料' }, { status: 400 })
    }

    const materialById = new Map(materials.map((material) => [material.id, material]))
    const items = input.items
      .filter((item) => item.quantity > 0)
      .map((item) => {
        const material = materialById.get(item.materialId)
        return {
          itemType: 'MATERIAL',
          materialId: item.materialId,
          quantity: item.quantity,
          unit: item.unit || material?.stockUnit || material?.unit || '件',
          wastageRate: item.wastageRate,
        }
      })

    const saved = await prisma.$transaction(async (tx) => {
      const bom = await tx.bOM.upsert({
        where: { productId: product.id },
        update: { isActive: true },
        create: { productId: product.id, version: 'v1', isActive: true },
        select: { id: true },
      })

      await tx.bOMItem.deleteMany({
        where: { bomId: bom.id, itemType: 'MATERIAL' },
      })

      if (items.length > 0) {
        await tx.bOMItem.createMany({
          data: items.map((item) => ({ ...item, bomId: bom.id })),
        })
      }

      return tx.bOM.findUnique({
        where: { id: bom.id },
        select: {
          id: true,
          version: true,
          isActive: true,
          items: {
            orderBy: { id: 'asc' },
            select: bomItemSelect,
          },
        },
      })
    })

    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'BOM',
      entityId: saved?.id || product.id,
      entityLabel: `${product.sku} ${product.name}`,
      afterData: saved,
    })

    return NextResponse.json({ data: saved, message: 'BOM 关系已保存' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    console.error('Save BOM error:', error)
    return NextResponse.json({ error: '保存 BOM 关系失败' }, { status: 500 })
  }
}
