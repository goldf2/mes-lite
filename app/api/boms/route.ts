import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { materialAsProductOption, resolveProductId, simpleProductSku } from '@/lib/material-product'

export const dynamic = 'force-dynamic'

const bomItemSchema = z.object({
  materialId: z.string().min(1, '请选择物料'),
  quantity: z.number().finite().positive('单位消耗量必须大于 0'),
  unit: z.string().trim().optional(),
  wastageRate: z.number().finite().nonnegative().optional().default(0),
})

const saveBomSchema = z.object({
  productId: z.string().min(1, '请选择物料'),
  outputQuantity: z.number().finite().positive().default(1),
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
      primaryMeasure: true,
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
            outputQuantity: true,
            outputUnit: true,
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
        primaryMeasure: true,
      },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
      take: 1000,
    }),
  ])

  const productBySku = new Map(products.flatMap((product) => [
    [product.sku, product],
    [product.sku.startsWith('MAT-') ? product.sku.slice(4) : product.sku, product],
  ]))
  const materialProducts = materialOptions
    .map((material) => {
      const product = productBySku.get(material.code) || productBySku.get(simpleProductSku(material.code))
      if (product) {
        return {
          ...materialAsProductOption(material),
          bom: product.bom,
        }
      }
      return { ...materialAsProductOption(material), bom: null }
    })

  return NextResponse.json({ products: materialProducts, materialOptions })
}

export async function PUT(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('bomCost', 'update')
    if (denied) return denied

    const input = saveBomSchema.parse(await req.json())
    const resolvedProductId = await prisma.$transaction((tx) => resolveProductId(tx, input.productId, { description: '由物料自动映射，用于 BOM 关系。' }))
    const product = await prisma.product.findUnique({ where: { id: resolvedProductId } })
    if (!product) return NextResponse.json({ error: '物料不存在' }, { status: 404 })
    const outputCode = product.sku.startsWith('MAT-') ? product.sku.slice(4) : product.sku
    const outputMaterial = await prisma.material.findFirst({
      where: { code: outputCode, deletedAt: null },
      select: { id: true, stockUnit: true, unit: true },
    })
    if (!outputMaterial) return NextResponse.json({ error: 'BOM 产出物料不存在或已归档' }, { status: 400 })

    const materialIds = Array.from(new Set(input.items.map((item) => item.materialId)))
    if (materialIds.includes(outputMaterial.id)) {
      return NextResponse.json({ error: 'BOM 不能消耗产出物料自身' }, { status: 400 })
    }
    if (materialIds.length !== input.items.length) {
      return NextResponse.json({ error: '同一原料不能重复关联' }, { status: 400 })
    }
    const materials = await prisma.material.findMany({
      where: { id: { in: materialIds }, deletedAt: null },
      select: { id: true, stockUnit: true, unit: true },
    })
    if (materials.length !== materialIds.length) {
      return NextResponse.json({ error: 'BOM 中存在无效或已归档物料' }, { status: 400 })
    }

    const materialById = new Map(materials.map((material) => [material.id, material]))
    const unitMismatch = input.items.find((item) => {
      const material = materialById.get(item.materialId)
      return item.unit && material && item.unit !== (material.stockUnit || material.unit)
    })
    if (unitMismatch) {
      const material = materialById.get(unitMismatch.materialId)
      return NextResponse.json(
        { error: `单位消耗量必须使用原料主库存单位 ${material?.stockUnit || material?.unit}` },
        { status: 400 },
      )
    }
    const items = input.items
      .map((item) => {
        const material = materialById.get(item.materialId)
        return {
          itemType: 'MATERIAL',
          materialId: item.materialId,
          quantity: item.quantity,
          unit: material?.stockUnit || material?.unit || '件',
          wastageRate: 0,
        }
      })

    const saved = await prisma.$transaction(async (tx) => {
      const bom = await tx.bOM.upsert({
        where: { productId: product.id },
        update: {
          isActive: true,
          outputQuantity: 1,
          outputUnit: outputMaterial.stockUnit || outputMaterial.unit,
        },
        create: {
          productId: product.id,
          version: 'v1',
          isActive: true,
          outputQuantity: 1,
          outputUnit: outputMaterial.stockUnit || outputMaterial.unit,
        },
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
          outputQuantity: true,
          outputUnit: true,
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

    return NextResponse.json({ data: saved, message: 'BOM 单位消耗量已保存' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    console.error('Save BOM error:', error)
    return NextResponse.json({ error: '保存 BOM 关系失败' }, { status: 500 })
  }
}
