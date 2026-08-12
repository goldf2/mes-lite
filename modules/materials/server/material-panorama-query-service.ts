import { prisma } from '@/lib/prisma'
import { attachWorkInstructionFiles, classifyMaterialAttachments } from './material-panorama-attachments'
import { panoramaProductSelect, processRouteSelect } from './material-panorama-select'

export class MaterialPanoramaNotFoundError extends Error {
  constructor() {
    super('物料不存在或已归档')
    this.name = 'MaterialPanoramaNotFoundError'
  }
}

export async function getMaterialPanorama(materialId: string) {
  const material = await prisma.material.findUnique({
    where: { id: materialId },
    include: {
      customer: { select: { id: true, code: true, name: true } },
      stock: {
        include: {
          locationBalances: { include: { location: true }, orderBy: { location: { code: 'asc' } } },
        },
      },
      processTemplates: { orderBy: [{ category: 'asc' }, { code: 'asc' }] },
      bomItems: {
        orderBy: { id: 'asc' },
        include: { bom: { include: { product: { select: panoramaProductSelect } } } },
      },
    },
  })
  if (!material || material.deletedAt) throw new MaterialPanoramaNotFoundError()

  const linkedProductSkus = Array.from(new Set([material.code, `MAT-${material.code}`]))
  const stockId = material.stock?.id
  const [
    attachments, targetOrders, consumingPicks, recentMaterialIns, recentStockLogs,
    costLayers, linkedProducts, formalWorkInstructions, linkedCostObjects,
  ] = await Promise.all([
    prisma.documentAttachment.findMany({
      where: { ownerType: 'MATERIAL', ownerId: material.id, deletedAt: null },
      orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.productionOrder.findMany({
      where: { materialId: material.id, deletedAt: null },
      include: {
        product: { select: panoramaProductSelect },
        targetMaterial: { select: {
          id: true, code: true, name: true, category: true, stockUnit: true, valuationUnit: true,
        } },
        _count: { select: { picks: true, reports: true, dispatches: true, stockIns: true } },
      },
      orderBy: { createdAt: 'desc' }, take: 12,
    }),
    prisma.pickItem.findMany({
      where: { materialId: material.id, order: { deletedAt: null } },
      include: { order: { include: {
        product: { select: panoramaProductSelect },
        targetMaterial: { select: {
          id: true, code: true, name: true, category: true, stockUnit: true, valuationUnit: true,
        } },
      } } },
      orderBy: { createdAt: 'desc' }, take: 12,
    }),
    prisma.materialIn.findMany({
      where: { materialId: material.id, deletedAt: null },
      include: { supplier: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: 'desc' }, take: 10,
    }),
    stockId ? prisma.stockLog.findMany({ where: { stockId }, orderBy: { createdAt: 'desc' }, take: 10 }) : Promise.resolve([]),
    prisma.inventoryCostLayer.findMany({ where: { materialId: material.id }, orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.product.findMany({
      where: { sku: { in: linkedProductSkus } },
      include: {
        customer: { select: { id: true, code: true, name: true } },
        processRoutes: { where: { isDefault: true }, select: processRouteSelect },
        boms: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
          include: { items: { include: {
            material: { select: {
              id: true, code: true, name: true, spec: true, category: true, stockUnit: true, valuationUnit: true,
            } },
            costObject: { select: { id: true, code: true, name: true, objectType: true, unit: true } },
            sawingScenario: { select: { id: true, name: true } },
          } } },
        },
      },
    }),
    prisma.workInstruction.findMany({
      where: { deletedAt: null, materialId: material.id },
      include: {
        category: { select: { id: true, name: true, parentId: true, parent: { select: { id: true, name: true } } } },
        material: { select: {
          id: true, code: true, name: true, spec: true,
          customer: { select: { id: true, code: true, name: true } },
        } },
        workCenters: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.costObject.findMany({
      where: { OR: [
        { sourceType: 'MATERIAL', sourceId: material.id },
        { bomItems: { some: { bom: { product: { sku: { in: linkedProductSkus } } } } } },
      ] },
      include: {
        costs: { where: { active: true }, orderBy: { effectiveFrom: 'desc' }, take: 1 },
        bomItems: { select: {
          id: true, quantity: true, unit: true,
          bom: { select: { product: { select: { id: true, sku: true, name: true, unit: true } } } },
        } },
      },
      orderBy: { createdAt: 'desc' }, take: 20,
    }),
  ])

  const instructionIds = formalWorkInstructions.map((instruction) => instruction.id)
  const instructionAttachments = instructionIds.length === 0 ? [] : await prisma.documentAttachment.findMany({
    where: { ownerType: 'WORK_INSTRUCTION', ownerId: { in: instructionIds }, deletedAt: null },
    orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true, ownerId: true, originalName: true, mimeType: true, size: true, note: true,
      documentType: true, isCover: true, rotation: true, createdAt: true,
    },
  })
  const locationBalances = (material.stock?.locationBalances || []).map((balance) => ({
    id: balance.id, locationCode: balance.location.code, locationName: balance.location.name,
    qty: balance.qty, reservedQty: balance.reservedQty, availableQty: balance.availableQty,
    quarantineQty: balance.quarantineQty, holdQty: balance.holdQty,
    note: balance.location.note || undefined,
  }))
  const productBoms = linkedProducts.flatMap((product) => product.boms.map((bom) => ({
    id: bom.id, name: bom.name, version: bom.version, isDefault: bom.isDefault, isActive: bom.isActive,
    outputQuantity: bom.outputQuantity, outputUnit: bom.outputUnit, createdAt: bom.createdAt,
    product: {
      id: product.id, sku: product.sku, name: product.name, category: product.category,
      unit: product.unit, customer: product.customer, processRoutes: product.processRoutes,
    },
    items: bom.items,
    latestCostRun: null as null | { id: string; unitCost: number; totalCost: number; quantityBasis: number; createdAt: Date },
  })))
  const productIds = productBoms.map((bom) => bom.product.id)
  const latestCostRuns = productIds.length === 0 ? [] : await prisma.bomCostRun.findMany({
    where: { productId: { in: productIds } }, orderBy: { createdAt: 'desc' },
    select: { id: true, productId: true, unitCost: true, totalCost: true, quantityBasis: true, createdAt: true },
  })
  const latestCostRunByProduct = new Map<string, typeof latestCostRuns[number]>()
  for (const run of latestCostRuns) if (!latestCostRunByProduct.has(run.productId)) latestCostRunByProduct.set(run.productId, run)
  for (const bom of productBoms) bom.latestCostRun = latestCostRunByProduct.get(bom.product.id) || null

  return {
    material,
    stock: material.stock,
    locationBalances,
    attachments: classifyMaterialAttachments(attachments),
    componentBoms: material.bomItems.map((item) => ({
      id: item.id, quantity: item.quantity, unit: item.unit, wastageRate: item.wastageRate, bom: item.bom,
    })),
    productBoms,
    costObjects: linkedCostObjects,
    processTemplates: material.processTemplates,
    workInstructions: attachWorkInstructionFiles(formalWorkInstructions, instructionAttachments),
    targetOrders,
    consumingPicks,
    recentMaterialIns,
    recentStockLogs,
    costLayers,
    integrityWarnings: material.stock ? [] : ['物料档案没有对应库存余额记录，库存管理不会显示该物料。'],
    modelNotes: [
      '库位余额只记录实物主库存数量；成本与核算数量继续按物料总库存统一核算。',
      '产品文档优先读取正式产品文档模块，旧附件文档保留为历史资料。',
    ],
  }
}
