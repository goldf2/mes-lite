import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const number = z.number().finite().nonnegative()
const materialProductPrefix = 'material:'
const simpleProductSku = (materialCode: string) => `MAT-${materialCode}`
const sawingCostObjectCode = (scenarioId: string) => `SAW-${scenarioId.slice(-8).toUpperCase()}`

type ProductResolver = Pick<typeof prisma, 'material' | 'product' | 'stock'>

async function resolveProductId(tx: ProductResolver, targetId?: string | null) {
  if (!targetId) return null
  if (!targetId.startsWith(materialProductPrefix)) return targetId

  const materialId = targetId.slice(materialProductPrefix.length)
  const material = await tx.material.findUnique({
    where: { id: materialId },
    select: { code: true, name: true, category: true, customerId: true, stockUnit: true, unit: true },
  })
  if (!material) throw new Error('物料不存在，无法映射为产品')

  const sku = simpleProductSku(material.code)
  const existing = await tx.product.findUnique({ where: { sku }, include: { stock: true } })
  if (existing) {
    if (!existing.stock) {
      await tx.stock.upsert({
        where: { productId: existing.id },
        update: {},
        create: { productId: existing.id },
      })
    }
    return existing.id
  }

  const created = await tx.product.create({
    data: {
      sku,
      name: material.name,
      category: material.category,
      customerId: material.customerId || null,
      unit: material.stockUnit || material.unit,
      description: `由物料 ${material.code} 自动映射，用于锯切成本/BOM 组成。`,
      stock: {
        create: {},
      },
    },
  })
  return created.id
}

const schema = z.object({
  name: z.string().trim().max(100).optional(),
  materialLength: number.positive(), materialWeight: number.positive(), workpieceLength: number.positive(), bladeThickness: number,
  rawMaterialPrice: number, sawdustPrice: number, scrapPrice: number, finishedPrice: number,
  quantity: z.number().int().positive(), utilization: number, productWeight: number, sawdustWeight: number, scrapWeight: number,
  netMaterialCost: number, materialCostPerPiece: number, profitPerPiece: z.number().finite(), totalRevenue: number, totalProfit: z.number().finite(), grossMargin: z.number().finite(),
  additionalDirectCost: z.number().finite(), laborCost: number, fixedCost: number, directStageCost: z.number().finite(), manufacturingCost: z.number().finite(), fullCost: z.number().finite(),
  directProfit: z.number().finite(), manufacturingProfit: z.number().finite(), fullProfit: z.number().finite(), directMargin: z.number().finite(), manufacturingMargin: z.number().finite(), fullMargin: z.number().finite(),
  productKind: z.enum(['EXISTING', 'TEMPORARY']).default('TEMPORARY'),
  productId: z.string().optional(),
  bomProductId: z.string().optional(),
  laborHoursPerPiece: number,
  machineHoursPerPiece: number,
  processTemplateIds: z.array(z.string()).default([]),
  costItems: z.array(z.object({
    stage: z.enum(['DIRECT', 'LABOR', 'FIXED']), name: z.string().trim().min(1), method: z.string().min(1),
    inputA: number, inputB: number, inputC: number, amount: z.number().finite(), isDeduction: z.boolean(), note: z.string().optional(), sortOrder: z.number().int().nonnegative(),
  })).default([]),
})

const include = {
  product: { select: { id: true, sku: true, name: true, unit: true } },
  bomItems: { include: { bom: { select: { id: true, product: { select: { id: true, sku: true, name: true } } } } } },
  processTemplates: { select: { id: true, code: true, name: true, category: true } },
  costItems: { orderBy: [{ stage: 'asc' as const }, { sortOrder: 'asc' as const }] },
}

export async function GET() {
  const denied = await requireResourcePermission('sawingCost', 'read')
  if (denied) return denied
  const [data, processTemplates, products, materials] = await Promise.all([
    prisma.sawingCostScenario.findMany({ include, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.processTemplate.findMany({ select: { id: true, code: true, name: true, category: true }, orderBy: [{ category: 'asc' }, { code: 'asc' }] }),
    prisma.product.findMany({ select: { id: true, sku: true, name: true, unit: true }, orderBy: { createdAt: 'desc' } }),
    prisma.material.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true, stockUnit: true, unit: true }, orderBy: { createdAt: 'desc' } }),
  ])
  const productOptions = [
    ...products,
    ...materials.map((material) => ({ id: `${materialProductPrefix}${material.id}`, sku: simpleProductSku(material.code), name: material.name, unit: material.stockUnit || material.unit })),
  ]
  return NextResponse.json({ data, processTemplates, products: productOptions })
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('sawingCost', 'create')
    if (denied) return denied
    const operator = await getCurrentOperator()
    const input = schema.parse(await req.json())
    const { processTemplateIds, costItems, bomProductId, ...values } = input
    if (values.productKind === 'EXISTING' && !values.productId) {
      return NextResponse.json({ error: '保存为已有产品时必须选择产品' }, { status: 400 })
    }
    const scenario = await prisma.$transaction(async (tx) => {
      const resolvedProductId = values.productKind === 'EXISTING' ? await resolveProductId(tx, values.productId) : null
      const resolvedBomProductId = await resolveProductId(tx, bomProductId)
      const linkedProduct = resolvedProductId ? await tx.product.findUnique({ where: { id: resolvedProductId }, select: { sku: true, name: true } }) : null
      const scenarioName = values.name?.trim()
        || (linkedProduct ? `${linkedProduct.sku} ${linkedProduct.name} 锯切成本` : `临时锯切 ${values.workpieceLength}mm ${values.bladeThickness}mm缝 ${values.materialCostPerPiece.toFixed(2)}元/件`)
      const created = await tx.sawingCostScenario.create({
        data: {
          ...values,
          name: scenarioName,
          productId: resolvedProductId,
          createdBy: operator?.name || operator?.username || null,
          processTemplates: { connect: processTemplateIds.map((id) => ({ id })) },
          costItems: { create: costItems },
        },
      })
      const costObject = await tx.costObject.create({
        data: {
          code: sawingCostObjectCode(created.id),
          name: scenarioName,
          objectType: 'SAWING_COST',
          sourceType: 'SAWING_COST_SCENARIO',
          sourceId: created.id,
          unit: '件',
          costs: {
            create: {
              version: 'v1',
              materialCostPerUnit: values.materialCostPerPiece,
              laborHoursPerUnit: values.laborHoursPerPiece,
              machineHoursPerUnit: values.machineHoursPerPiece,
              directCostPerUnit: values.additionalDirectCost || 0,
            },
          },
        },
      })

      if (resolvedBomProductId) {
        const bom = await tx.bOM.upsert({
          where: { productId: resolvedBomProductId },
          update: {},
          create: { productId: resolvedBomProductId },
        })
        await tx.bOMItem.create({
          data: {
            bomId: bom.id,
            itemType: 'SAWING_COST',
            costObjectId: costObject.id,
            sawingScenarioId: created.id,
            quantity: 1,
            unit: '件',
            wastageRate: 0,
          },
        })
      }

      return tx.sawingCostScenario.findUniqueOrThrow({ where: { id: created.id }, include })
    })
    await writeAuditLog(req, { action: 'CREATE', entityType: 'SAWING_COST_SCENARIO', entityId: scenario.id, entityLabel: scenario.name, afterData: scenario })
    return NextResponse.json({ data: scenario }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    console.error('Create sawing cost scenario error:', error)
    return NextResponse.json({ error: '保存锯切成本方案失败' }, { status: 500 })
  }
}
