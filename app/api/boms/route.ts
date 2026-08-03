import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { materialAsProductOption, resolveProductId, simpleProductSku } from '@/lib/material-product'
import { isMeterUnit } from '@/lib/units'

export const dynamic = 'force-dynamic'

const bomItemSchema = z.object({
  materialId: z.string().min(1, '请选择物料'),
  quantity: z.number().finite().positive('批量用量必须大于 0'),
  unit: z.string().trim().optional(),
  wastageRate: z.number().finite().nonnegative().optional().default(0),
})

const saveBomSchema = z.object({
  productId: z.string().min(1, '请选择物料'),
  bomId: z.string().min(1).optional(),
  createNew: z.boolean().optional().default(false),
  name: z.string().trim().min(1).max(80).optional(),
  version: z.string().trim().min(1).max(30).optional(),
  bomType: z.enum(['STANDARD', 'BASE_ONE_TO_ONE']).optional().default('STANDARD'),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional().default(true),
  outputQuantity: z.number().finite().positive('基准产出数量必须大于 0').default(1),
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

const bomSelect = {
  id: true,
  name: true,
  version: true,
  bomType: true,
  isDefault: true,
  isActive: true,
  outputQuantity: true,
  outputUnit: true,
  createdAt: true,
  items: {
    orderBy: { id: 'asc' as const },
    select: bomItemSelect,
  },
} as const

type ListedBom = Prisma.BOMGetPayload<{ select: typeof bomSelect }>

function pickDefaultBom(boms: ListedBom[]) {
  return boms.find((bom) => bom.isActive && bom.isDefault)
    || boms.find((bom) => bom.isActive)
    || boms[0]
    || null
}

function nextVersion(existingVersions: string[]) {
  const largest = existingVersions.reduce((current, version) => {
    const match = /^v(\d+)$/i.exec(version)
    return match ? Math.max(current, Number(match[1])) : current
  }, 0)
  return `v${largest + 1}`
}

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
        boms: {
          select: bomSelect,
          orderBy: [{ isActive: 'desc' }, { isDefault: 'desc' }, { createdAt: 'desc' }],
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
    [product.sku, product] as const,
    [product.sku.startsWith('MAT-') ? product.sku.slice(4) : product.sku, product] as const,
  ]))
  const materialProducts = materialOptions.map((material) => {
    const product = productBySku.get(material.code) || productBySku.get(simpleProductSku(material.code))
    if (!product) return { ...materialAsProductOption(material), bom: null, boms: [] }
    return {
      ...materialAsProductOption(material),
      bom: pickDefaultBom(product.boms),
      boms: product.boms,
    }
  })

  return NextResponse.json({ products: materialProducts, materialOptions })
}

export async function PUT(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('bomCost', 'update')
    if (denied) return denied

    const input = saveBomSchema.parse(await req.json())
    if (input.bomType === 'BASE_ONE_TO_ONE' && (
      input.outputQuantity !== 1
      || input.items.length !== 1
      || input.items[0].quantity !== 1
    )) {
      return NextResponse.json({ error: '一对一基础 BOM 必须为 1 个输入对应 1 个产出' }, { status: 400 })
    }

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
      return NextResponse.json({ error: 'BOM 不能消耗产出物料自身；同物料移库请使用移库单' }, { status: 400 })
    }
    if (materialIds.length !== input.items.length) {
      return NextResponse.json({ error: '同一原料不能重复关联' }, { status: 400 })
    }
    const materials = await prisma.material.findMany({
      where: { id: { in: materialIds }, deletedAt: null },
      select: { id: true, primaryMeasure: true, stockUnit: true, unit: true },
    })
    if (materials.length !== materialIds.length) {
      return NextResponse.json({ error: 'BOM 中存在无效或已归档物料' }, { status: 400 })
    }
    const invalidLengthMaterial = materials.find((material) => (
      material.primaryMeasure === 'LENGTH' && !isMeterUnit(material.stockUnit || material.unit)
    ))
    if (invalidLengthMaterial) {
      return NextResponse.json(
        { error: '长度原料的主库存单位必须为 m，BOM 尺寸录入值会统一换算为米保存' },
        { status: 400 },
      )
    }

    const materialById = new Map(materials.map((material) => [material.id, material]))
    const items = input.items.map((item) => {
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
      const existingBoms = await tx.bOM.findMany({
        where: { productId: product.id },
        select: { id: true, version: true, isDefault: true, isActive: true },
        orderBy: { createdAt: 'desc' },
      })
      let target = input.bomId
        ? existingBoms.find((bom) => bom.id === input.bomId)
        : undefined
      if (input.bomId && !target) throw new Error('BOM_NOT_FOUND')
      if (!target && !input.createNew) {
        target = existingBoms.find((bom) => bom.isActive && bom.isDefault)
          || existingBoms.find((bom) => bom.isActive)
          || existingBoms[0]
      }

      const shouldDefault = input.isDefault ?? (target?.isDefault || existingBoms.length === 0)
      const version = input.version || target?.version || nextVersion(existingBoms.map((bom) => bom.version))
      if ((!target || version !== target.version) && existingBoms.some((bom) => bom.version === version)) {
        throw new Error('BOM_VERSION_EXISTS')
      }
      if (shouldDefault) {
        await tx.bOM.updateMany({
          where: { productId: product.id, ...(target ? { id: { not: target.id } } : {}) },
          data: { isDefault: false },
        })
      }

      const bom = target
        ? await tx.bOM.update({
            where: { id: target.id },
            data: {
              name: input.name || '默认方案',
              version,
              bomType: input.bomType,
              isDefault: shouldDefault,
              isActive: input.isActive,
              outputQuantity: input.outputQuantity,
              outputUnit: outputMaterial.stockUnit || outputMaterial.unit,
            },
            select: { id: true },
          })
        : await tx.bOM.create({
            data: {
              productId: product.id,
              name: input.name || (input.bomType === 'BASE_ONE_TO_ONE' ? '一对一基础转换' : `方案 ${version}`),
              version,
              bomType: input.bomType,
              isDefault: shouldDefault,
              isActive: input.isActive,
              outputQuantity: input.outputQuantity,
              outputUnit: outputMaterial.stockUnit || outputMaterial.unit,
            },
            select: { id: true },
          })

      const replacedItemIds = (await tx.bOMItem.findMany({
        where: { bomId: bom.id, itemType: 'MATERIAL' },
        select: { id: true },
      })).map((item) => item.id)
      if (replacedItemIds.length > 0) {
        await tx.dailyProductionConsumption.updateMany({
          where: { bomItemId: { in: replacedItemIds } },
          data: { bomItemId: null },
        })
        await tx.bOMItem.deleteMany({ where: { id: { in: replacedItemIds } } })
      }
      if (items.length > 0) {
        await tx.bOMItem.createMany({
          data: items.map((item) => ({ ...item, bomId: bom.id })),
        })
      }

      await tx.bOM.updateMany({
        where: { productId: product.id, isActive: false, isDefault: true },
        data: { isDefault: false },
      })
      const activeDefault = await tx.bOM.findFirst({
        where: { productId: product.id, isActive: true, isDefault: true },
        select: { id: true },
      })
      if (!activeDefault) {
        const replacement = await tx.bOM.findFirst({
          where: { productId: product.id, isActive: true },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
        if (replacement) await tx.bOM.update({ where: { id: replacement.id }, data: { isDefault: true } })
      }

      return tx.bOM.findUnique({ where: { id: bom.id }, select: bomSelect })
    })

    await writeAuditLog(req, {
      action: input.createNew ? 'CREATE' : 'UPDATE',
      entityType: 'BOM',
      entityId: saved?.id || product.id,
      entityLabel: `${product.sku} ${product.name} ${saved?.name || ''} ${saved?.version || ''}`.trim(),
      afterData: saved,
    })

    return NextResponse.json({ data: saved, message: input.createNew ? 'BOM 方案已创建' : 'BOM 方案已保存' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    if (error instanceof Error && error.message === 'BOM_NOT_FOUND') return NextResponse.json({ error: 'BOM 方案不存在' }, { status: 404 })
    if (error instanceof Error && error.message === 'BOM_VERSION_EXISTS') return NextResponse.json({ error: '同一产品的 BOM 版本号不能重复' }, { status: 409 })
    console.error('Save BOM error:', error)
    return NextResponse.json({ error: '保存 BOM 方案失败' }, { status: 500 })
  }
}
