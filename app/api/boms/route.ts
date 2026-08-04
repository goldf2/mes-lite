import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { materialAsProductOption, materialProductPrefix, resolveProductId, simpleProductSku } from '@/lib/material-product'
import { normalizeBomEntryQuantity } from '@/lib/bom-entry-units'
import { getUnitCatalog } from '@/lib/unit-catalog'

export const dynamic = 'force-dynamic'

const bomItemSchema = z.object({
  materialId: z.string().min(1, '请选择物料'),
  outputMaterialId: z.string().min(1).nullable().optional(),
  quantity: z.number().finite().positive('批量用量必须大于 0'),
  unit: z.string().trim().optional(),
  entryUnit: z.string().trim().min(1).max(20).optional(),
  wastageRate: z.number().finite().nonnegative().optional().default(0),
})

const bomOutputSchema = z.object({
  materialId: z.string().min(1, '请选择产出物料'),
  quantity: z.number().finite().positive('基准产出数量必须大于 0'),
  entryUnit: z.string().trim().min(1).max(20).optional(),
  isPrimary: z.boolean().optional().default(false),
})

const saveBomSchema = z.object({
  productId: z.string().min(1, '请选择物料'),
  bomId: z.string().min(1).optional(),
  createNew: z.boolean().optional().default(false),
  name: z.string().trim().min(1).max(80).optional(),
  version: z.string().trim().min(1).max(30).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional().default(true),
  outputQuantity: z.number().finite().positive('基准产出数量必须大于 0').default(1),
  outputs: z.array(bomOutputSchema).min(1, '至少需要一项产出').max(50, 'BOM 产出过多').optional(),
  items: z.array(bomItemSchema).min(1, '至少需要一项投入').max(200, 'BOM 明细过多'),
})

const bomItemSelect = {
  id: true,
  itemType: true,
  quantity: true,
  unit: true,
  entryUnit: true,
  wastageRate: true,
  outputMaterialId: true,
  outputMaterial: {
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
  isDefault: true,
  isActive: true,
  outputQuantity: true,
  outputUnit: true,
  createdAt: true,
  outputs: {
    orderBy: { isPrimary: 'desc' as const },
    select: {
      id: true,
      quantity: true,
      unit: true,
      entryUnit: true,
      isPrimary: true,
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
    },
  },
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

  const materialIds = materialOptions.map((material) => material.id)
  const [images, stocks] = materialIds.length === 0
    ? [[], []] as const
    : await Promise.all([
        prisma.documentAttachment.findMany({
          where: {
            ownerType: 'MATERIAL',
            ownerId: { in: materialIds },
            documentType: 'MATERIAL_IMAGE',
            mimeType: { startsWith: 'image/' },
            deletedAt: null,
          },
          orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
          select: { id: true, ownerId: true, note: true, mimeType: true, isCover: true },
        }),
        prisma.stock.findMany({
          where: { materialId: { in: materialIds } },
          select: { materialId: true, qty: true },
        }),
      ])
  const primaryImageByMaterial = new Map<string, (typeof images)[number]>()
  for (const image of images) {
    if (!primaryImageByMaterial.has(image.ownerId)) primaryImageByMaterial.set(image.ownerId, image)
  }
  const stockQtyByMaterial = new Map(stocks.map((stock) => [stock.materialId, Number(stock.qty)]))
  const materialOptionsWithSummary = materialOptions.map((material) => {
    const image = primaryImageByMaterial.get(material.id)
    return {
      ...material,
      stockQty: stockQtyByMaterial.get(material.id) || 0,
      primaryImage: image ? {
        id: image.id,
        url: `/api/attachments/${image.id}/file`,
        note: image.note,
        mimeType: image.mimeType,
        isCover: image.isCover,
      } : null,
    }
  })

  return NextResponse.json({ products: materialProducts, materialOptions: materialOptionsWithSummary })
}

export async function PUT(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('bomCost', 'update')
    if (denied) return denied

    const input = saveBomSchema.parse(await req.json())
    const unitCatalog = await getUnitCatalog()
    const submittedOutputs = input.outputs || []
    if (submittedOutputs.length > 0) {
      const primaryCount = submittedOutputs.filter((output) => output.isPrimary).length
      if (primaryCount !== 1) {
        return NextResponse.json({ error: 'BOM 必须且只能设置一项主产出' }, { status: 400 })
      }
      if (new Set(submittedOutputs.map((output) => output.materialId)).size !== submittedOutputs.length) {
        return NextResponse.json({ error: '同一产出物料不能重复添加' }, { status: 400 })
      }
    }

    const requestedPrimaryMaterialId = submittedOutputs.find((output) => output.isPrimary)?.materialId
    const resolvedProductId = await prisma.$transaction((tx) => resolveProductId(
      tx,
      requestedPrimaryMaterialId ? `${materialProductPrefix}${requestedPrimaryMaterialId}` : input.productId,
      { description: '由 BOM 主产出物料自动映射。' },
    ))
    const product = await prisma.product.findUnique({ where: { id: resolvedProductId } })
    if (!product) return NextResponse.json({ error: '物料不存在' }, { status: 404 })
    const outputCode = product.sku.startsWith('MAT-') ? product.sku.slice(4) : product.sku
    const legacyOutputMaterial = submittedOutputs.length === 0
      ? await prisma.material.findFirst({
          where: { code: outputCode, deletedAt: null },
          select: { id: true, stockUnit: true, unit: true },
        })
      : null
    const normalizedOutputs = submittedOutputs.length > 0
      ? submittedOutputs
      : legacyOutputMaterial
        ? [{ materialId: legacyOutputMaterial.id, quantity: input.outputQuantity, isPrimary: true }]
        : []
    if (normalizedOutputs.length === 0) return NextResponse.json({ error: 'BOM 产出物料不存在或已归档' }, { status: 400 })

    const outputMaterialIds = normalizedOutputs.map((output) => output.materialId)
    const outputMaterials = await prisma.material.findMany({
      where: { id: { in: outputMaterialIds }, deletedAt: null },
      select: { id: true, code: true, name: true, primaryMeasure: true, stockUnit: true, unit: true },
    })
    if (outputMaterials.length !== outputMaterialIds.length) {
      return NextResponse.json({ error: 'BOM 中存在无效或已归档的产出物料' }, { status: 400 })
    }
    const outputMaterialById = new Map(outputMaterials.map((material) => [material.id, material]))
    const submittedPrimaryOutput = normalizedOutputs.find((output) => output.isPrimary)!
    const primaryOutputMaterial = outputMaterialById.get(submittedPrimaryOutput.materialId)!

    if (new Set(input.items.map((item) => item.materialId)).size !== input.items.length) {
      return NextResponse.json({ error: '同一投入物料不能重复添加' }, { status: 400 })
    }

    const materialIds = Array.from(new Set(input.items.map((item) => item.materialId)))
    if (materialIds.some((materialId) => outputMaterialIds.includes(materialId))) {
      return NextResponse.json({ error: 'BOM 投入与产出不能使用同一物料；同物料跨库位请使用流程转移' }, { status: 400 })
    }
    const materials = await prisma.material.findMany({
      where: { id: { in: materialIds }, deletedAt: null },
      select: { id: true, primaryMeasure: true, stockUnit: true, unit: true },
    })
    if (materials.length !== materialIds.length) {
      return NextResponse.json({ error: 'BOM 中存在无效或已归档物料' }, { status: 400 })
    }
    const materialById = new Map(materials.map((material) => [material.id, material]))
    const items = input.items.map((item) => {
      const material = materialById.get(item.materialId)!
      const normalized = normalizeBomEntryQuantity({
        quantity: item.quantity,
        entryUnit: item.entryUnit || item.unit,
        material,
        catalog: unitCatalog,
      })
      return {
        itemType: 'MATERIAL',
        materialId: item.materialId,
        outputMaterialId: null,
        quantity: normalized.quantity,
        unit: normalized.unit,
        entryUnit: normalized.entryUnit,
        wastageRate: 0,
      }
    })
    const outputs = normalizedOutputs.map((output) => {
      const material = outputMaterialById.get(output.materialId)!
      const normalized = normalizeBomEntryQuantity({
        quantity: output.quantity,
        entryUnit: output.entryUnit,
        material,
        catalog: unitCatalog,
      })
      return {
        materialId: output.materialId,
        quantity: normalized.quantity,
        unit: normalized.unit,
        entryUnit: normalized.entryUnit,
        isPrimary: Boolean(output.isPrimary),
      }
    })
    const primaryOutput = outputs.find((output) => output.isPrimary)!

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
              isDefault: shouldDefault,
              isActive: input.isActive,
              outputQuantity: primaryOutput.quantity,
              outputUnit: primaryOutputMaterial.stockUnit || primaryOutputMaterial.unit,
            },
            select: { id: true },
          })
        : await tx.bOM.create({
            data: {
              productId: product.id,
              name: input.name || `方案 ${version}`,
              version,
              isDefault: shouldDefault,
              isActive: input.isActive,
              outputQuantity: primaryOutput.quantity,
              outputUnit: primaryOutputMaterial.stockUnit || primaryOutputMaterial.unit,
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
      await tx.bOMOutput.deleteMany({ where: { bomId: bom.id } })
      await tx.bOMOutput.createMany({
        data: outputs.map((output) => ({ ...output, bomId: bom.id })),
      })

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
    if (error instanceof Error && /BOM 数量|所选单位|必须使用主库存单位|无法换算|换算后的 BOM/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Save BOM error:', error)
    return NextResponse.json({ error: '保存 BOM 方案失败' }, { status: 500 })
  }
}
