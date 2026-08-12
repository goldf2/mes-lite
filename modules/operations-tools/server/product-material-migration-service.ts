import type { Prisma, PrismaClient } from '@prisma/client'
import { createHash } from 'node:crypto'

const epsilon = 0.000001
const nonZero = (value: unknown) => Math.abs(Number(value || 0)) > epsilon

export type StockDisposition = 'NONE' | 'DELETE_EMPTY_PRODUCT_STOCK' | 'MOVE_EMPTY_PRODUCT_STOCK_TO_MATERIAL'

export interface ProductMaterialMappingPlan {
  format: 'mes-lite-product-material-mapping'
  formatVersion: 1
  generatedAt: string
  snapshotSha256: string
  confirmation: { confirmedBy: string; confirmedAt: string }
  materialCatalog: Array<{
    materialId: string
    materialCode: string
    materialName: string
    category: string
    materialStockExists: boolean
  }>
  products: Array<{
    productId: string
    productSku: string
    productName: string
    currentMaterialId: string | null
    dependencies: Record<string, number>
    productStock: {
      exists: boolean
      risky: boolean
      materialStockExists: boolean
      suggestedDisposition: StockDisposition
    }
    candidates: Array<{
      materialId: string
      materialCode: string
      materialName: string
      evidence: string[]
    }>
    decision: {
      materialId: string | null
      materialCode: string | null
      stockDisposition: StockDisposition
      note: string
    }
  }>
}

export class ProductMaterialMigrationError extends Error {}

function mappingSnapshotSha256(input: Pick<ProductMaterialMappingPlan, 'materialCatalog' | 'products'>) {
  const products = input.products.map(({ decision: _decision, ...product }) => product)
  return createHash('sha256').update(JSON.stringify({ materialCatalog: input.materialCatalog, products })).digest('hex')
}

async function requireProjectionSchema(db: PrismaClient) {
  const required: Array<[string, string]> = [
    ['Product', 'materialId'], ['BOM', 'materialId'], ['BomCostRun', 'materialId'],
    ['ProcessRoute', 'materialId'], ['SawingCostScenario', 'materialId'], ['StockIn', 'materialId'],
  ]
  for (const [table, column] of required) {
    const rows = await db.$queryRawUnsafe<Array<{ count: bigint | number }>>(
      `SELECT COUNT(*) AS count FROM pragma_table_info('${table}') WHERE name = '${column}'`,
    )
    if (Number(rows[0]?.count || 0) !== 1) {
      throw new ProductMaterialMigrationError(`数据库缺少 ${table}.${column}，请先部署 Material 投影扩展迁移`)
    }
  }
}

function addCandidate(
  map: Map<string, { materialId: string; materialCode: string; materialName: string; evidence: Set<string> }>,
  material: { id: string; code: string; name: string } | null | undefined,
  evidence: string,
) {
  if (!material) return
  const existing = map.get(material.id) || {
    materialId: material.id,
    materialCode: material.code,
    materialName: material.name,
    evidence: new Set<string>(),
  }
  existing.evidence.add(evidence)
  map.set(material.id, existing)
}

function stockRisk(stock: {
  qty: number; reservedQty: number; availableQty: number; quarantineQty: number; holdQty: number; reworkQty: number; valuationQty: number
  reservedValuationQty: number; availableValuationQty: number; quarantineValuationQty: number; holdValuationQty: number; reworkValuationQty: number
  totalCost: number; quarantineCost: number; holdCost: number; reworkCost: number
  valuationUnitCost: number; stockUnitCost: number
  logs: Array<{ id: string }>
  locationBalances: Array<{ qty: number; reservedQty: number; availableQty: number; quarantineQty: number; holdQty: number; reworkQty: number }>
} | null) {
  return Boolean(stock && (
    [
      stock.qty, stock.reservedQty, stock.availableQty, stock.quarantineQty, stock.holdQty, stock.reworkQty, stock.valuationQty,
      stock.reservedValuationQty, stock.availableValuationQty, stock.quarantineValuationQty, stock.holdValuationQty, stock.reworkValuationQty,
      stock.totalCost, stock.quarantineCost, stock.holdCost, stock.reworkCost,
      stock.valuationUnitCost, stock.stockUnitCost,
    ].some(nonZero)
    || stock.logs.length > 0
    || stock.locationBalances.some((balance) => (
      [balance.qty, balance.reservedQty, balance.availableQty, balance.quarantineQty, balance.holdQty, balance.reworkQty].some(nonZero)
    ))
  ))
}

export async function buildProductMaterialMappingPlan(db: PrismaClient): Promise<ProductMaterialMappingPlan> {
  await requireProjectionSchema(db)
  const products = await db.product.findMany({ orderBy: { sku: 'asc' } })
  const materials = await db.material.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, name: true, category: true, stock: { select: { id: true } } },
    orderBy: { code: 'asc' },
  })
  const materialById = new Map(materials.map((material) => [material.id, material]))
  const materialByCode = new Map(materials.map((material) => [material.code, material]))
  const result = []

  for (const product of products) {
    const [boms, bomCostRuns, processRoutes, sawingScenarios, productionOrders, stockIns, shipments, returns, stock] = await Promise.all([
      db.bOM.findMany({
        where: { productId: product.id },
        select: { materialId: true, outputs: { where: { isPrimary: true }, select: { material: { select: { id: true, code: true, name: true } } } } },
      }),
      db.bomCostRun.findMany({ where: { productId: product.id }, select: { materialId: true } }),
      db.processRoute.findMany({ where: { productId: product.id }, select: { materialId: true } }),
      db.sawingCostScenario.findMany({ where: { productId: product.id }, select: { materialId: true } }),
      db.productionOrder.findMany({ where: { productId: product.id }, select: { materialId: true } }),
      db.stockIn.findMany({ where: { productId: product.id }, select: { materialId: true } }),
      db.shipment.findMany({
        where: { productId: product.id },
        select: {
          material: { select: { id: true, code: true, name: true } },
          salesOrderItem: { select: { material: { select: { id: true, code: true, name: true } } } },
        },
      }),
      db.returnOrder.findMany({
        where: { productId: product.id },
        select: {
          material: { select: { id: true, code: true, name: true } },
          shipment: { select: { material: { select: { id: true, code: true, name: true } } } },
        },
      }),
      db.stock.findUnique({
        where: { productId: product.id },
        include: { logs: { select: { id: true }, take: 1 }, locationBalances: true },
      }),
    ])
    const candidateMap = new Map<string, { materialId: string; materialCode: string; materialName: string; evidence: Set<string> }>()
    addCandidate(candidateMap, product.materialId ? materialById.get(product.materialId) : null, '现有显式 Product.materialId')
    const codeCandidates = product.sku.startsWith('MAT-') ? [product.sku, product.sku.slice(4)] : [product.sku]
    for (const code of codeCandidates) addCandidate(candidateMap, materialByCode.get(code), `编码候选 ${code}`)
    for (const bom of boms) {
      addCandidate(candidateMap, bom.materialId ? materialById.get(bom.materialId) : null, 'BOM materialId')
      for (const output of bom.outputs) addCandidate(candidateMap, output.material, 'BOM 主产出')
    }
    for (const run of bomCostRuns) addCandidate(candidateMap, run.materialId ? materialById.get(run.materialId) : null, 'BOM 成本 materialId')
    for (const route of processRoutes) addCandidate(candidateMap, route.materialId ? materialById.get(route.materialId) : null, '工艺路线 materialId')
    for (const scenario of sawingScenarios) addCandidate(candidateMap, scenario.materialId ? materialById.get(scenario.materialId) : null, '锯切方案 materialId')
    for (const order of productionOrders) addCandidate(candidateMap, order.materialId ? materialById.get(order.materialId) : null, '生产订单 materialId')
    for (const stockIn of stockIns) addCandidate(candidateMap, stockIn.materialId ? materialById.get(stockIn.materialId) : null, '历史生产入库 materialId')
    for (const shipment of shipments) {
      addCandidate(candidateMap, shipment.material, '发货单 materialId')
      addCandidate(candidateMap, shipment.salesOrderItem?.material, '销售订单明细')
    }
    for (const returned of returns) {
      addCandidate(candidateMap, returned.material, '退货单 materialId')
      addCandidate(candidateMap, returned.shipment?.material, '来源发货单')
    }
    const risky = stockRisk(stock)
    const candidates = Array.from(candidateMap.values()).map((candidate) => ({
      materialId: candidate.materialId,
      materialCode: candidate.materialCode,
      materialName: candidate.materialName,
      evidence: Array.from(candidate.evidence).sort(),
    })).sort((left, right) => left.materialId.localeCompare(right.materialId))
    const onlyCandidate = candidates.length === 1 ? candidates[0] : null
    const selectedMaterial = product.materialId ? materialById.get(product.materialId) : onlyCandidate ? materialById.get(onlyCandidate.materialId) : null
    const materialStockExists = Boolean(selectedMaterial?.stock)
    const suggestedDisposition: StockDisposition = !stock
      ? 'NONE'
      : materialStockExists ? 'DELETE_EMPTY_PRODUCT_STOCK' : 'MOVE_EMPTY_PRODUCT_STOCK_TO_MATERIAL'
    result.push({
      productId: product.id,
      productSku: product.sku,
      productName: product.name,
      currentMaterialId: product.materialId,
      dependencies: {
        boms: boms.length, bomCostRuns: bomCostRuns.length, processRoutes: processRoutes.length,
        sawingScenarios: sawingScenarios.length, productionOrders: productionOrders.length,
        stockIns: stockIns.length, shipments: shipments.length, returns: returns.length,
        bomsWithoutSinglePrimaryOutput: boms.filter((bom) => bom.outputs.length !== 1).length,
      },
      productStock: { exists: Boolean(stock), risky, materialStockExists, suggestedDisposition },
      candidates,
      decision: {
        materialId: product.materialId || onlyCandidate?.materialId || null,
        materialCode: product.materialId ? materialById.get(product.materialId)?.code || null : onlyCandidate?.materialCode || null,
        stockDisposition: suggestedDisposition,
        note: '',
      },
    })
  }
  const materialCatalog = materials.map((material) => ({
    materialId: material.id,
    materialCode: material.code,
    materialName: material.name,
    category: material.category,
    materialStockExists: Boolean(material.stock),
  }))
  const planWithoutFingerprint = {
    format: 'mes-lite-product-material-mapping' as const,
    formatVersion: 1 as const,
    generatedAt: new Date().toISOString(),
    confirmation: { confirmedBy: '', confirmedAt: '' },
    materialCatalog,
    products: result,
  }
  return { ...planWithoutFingerprint, snapshotSha256: mappingSnapshotSha256(planWithoutFingerprint) }
}

function requireConfirmedPlan(input: ProductMaterialMappingPlan) {
  if (input.format !== 'mes-lite-product-material-mapping' || input.formatVersion !== 1 || !Array.isArray(input.products)) {
    throw new ProductMaterialMigrationError('映射文件格式或版本无效')
  }
  if (!input.confirmation?.confirmedBy?.trim()) throw new ProductMaterialMigrationError('映射文件缺少 confirmation.confirmedBy')
  if (!/^[a-f0-9]{64}$/.test(input.snapshotSha256 || '')) throw new ProductMaterialMigrationError('映射文件缺少有效 snapshotSha256')
  const generatedAt = Date.parse(input.generatedAt)
  if (!Number.isFinite(generatedAt)) throw new ProductMaterialMigrationError('映射文件缺少有效 generatedAt')
  const confirmedAt = Date.parse(input.confirmation.confirmedAt)
  if (!Number.isFinite(confirmedAt)) throw new ProductMaterialMigrationError('映射文件缺少有效 confirmation.confirmedAt')
  if (confirmedAt < generatedAt) throw new ProductMaterialMigrationError('映射确认时间不能早于计划生成时间')
  if (confirmedAt > Date.now() + 60_000) throw new ProductMaterialMigrationError('映射确认时间不能晚于当前时间')
}

export async function applyProductMaterialMapping(db: PrismaClient, input: ProductMaterialMappingPlan) {
  await requireProjectionSchema(db)
  requireConfirmedPlan(input)
  const currentProducts = await db.product.findMany({ orderBy: { sku: 'asc' } })
  const decisionByProduct = new Map(input.products.map((item) => [item.productId, item]))
  if (decisionByProduct.size !== input.products.length) throw new ProductMaterialMigrationError('映射文件存在重复 productId')
  if (currentProducts.length !== input.products.length || currentProducts.some((item) => !decisionByProduct.has(item.id))) {
    throw new ProductMaterialMigrationError('映射文件没有完整覆盖当前 Product；请重新生成并人工确认')
  }
  const materialIds = input.products.map((item) => item.decision.materialId).filter((id): id is string => Boolean(id))
  if (materialIds.length !== input.products.length) throw new ProductMaterialMigrationError('每个 Product 都必须选择 materialId')
  if (new Set(materialIds).size !== materialIds.length) throw new ProductMaterialMigrationError('一个 Material 只能绑定一个兼容 Product')
  const materials = await db.material.findMany({ where: { id: { in: materialIds }, deletedAt: null } })
  const materialById = new Map(materials.map((item) => [item.id, item]))
  if (materials.length !== materialIds.length) throw new ProductMaterialMigrationError('映射包含不存在或已归档的 Material')

  type Prepared = {
    productId: string; materialId: string; stockId: string | null; stockDisposition: StockDisposition
    counts: Record<string, number>
  }
  const prepared: Prepared[] = []
  for (const product of currentProducts) {
    const mapping = decisionByProduct.get(product.id)!
    const materialId = mapping.decision.materialId!
    const material = materialById.get(materialId)!
    if (mapping.productSku !== product.sku || mapping.productName !== product.name) {
      throw new ProductMaterialMigrationError(`Product ${product.id} 在生成计划后已变化，请重新生成映射`)
    }
    if (mapping.decision.materialCode !== material.code) throw new ProductMaterialMigrationError(`Product ${product.sku} 的 materialCode 与 materialId 不一致`)
    if (!mapping.decision.note?.trim()) throw new ProductMaterialMigrationError(`Product ${product.sku} 的映射缺少 decision.note 确认依据`)
    if (product.materialId && product.materialId !== materialId) throw new ProductMaterialMigrationError(`Product ${product.sku} 已绑定其他 Material`)

    const [boms, bomCostRuns, processRoutes, sawingScenarios, productionOrders, stockIns, shipments, returns, stock, materialStock] = await Promise.all([
      db.bOM.findMany({ where: { productId: product.id }, include: { outputs: { where: { isPrimary: true } } } }),
      db.bomCostRun.findMany({ where: { productId: product.id }, select: { materialId: true } }),
      db.processRoute.findMany({ where: { productId: product.id }, select: { materialId: true } }),
      db.sawingCostScenario.findMany({ where: { productId: product.id }, select: { materialId: true } }),
      db.productionOrder.findMany({ where: { productId: product.id }, select: { materialId: true } }),
      db.stockIn.findMany({ where: { productId: product.id }, select: { materialId: true } }),
      db.shipment.findMany({ where: { productId: product.id }, select: { materialId: true, salesOrderItem: { select: { materialId: true } } } }),
      db.returnOrder.findMany({ where: { productId: product.id }, select: { materialId: true, shipment: { select: { materialId: true } } } }),
      db.stock.findUnique({ where: { productId: product.id }, include: { logs: { select: { id: true }, take: 1 }, locationBalances: true } }),
      db.stock.findUnique({ where: { materialId }, select: { id: true } }),
    ])
    const projectionValues = [
      ...boms.map((item) => item.materialId), ...bomCostRuns.map((item) => item.materialId),
      ...processRoutes.map((item) => item.materialId), ...sawingScenarios.map((item) => item.materialId),
      ...productionOrders.map((item) => item.materialId), ...stockIns.map((item) => item.materialId),
      ...shipments.flatMap((item) => [item.materialId, item.salesOrderItem?.materialId]),
      ...returns.flatMap((item) => [item.materialId, item.shipment?.materialId]),
    ].filter((id): id is string => Boolean(id))
    if (projectionValues.some((id) => id !== materialId)) {
      throw new ProductMaterialMigrationError(`Product ${product.sku} 的现有单据投影与人工映射冲突`)
    }
    const primaryOutputIds = boms.flatMap((bom) => bom.outputs.map((output) => output.materialId))
    if (boms.some((bom) => bom.outputs.length !== 1)) {
      throw new ProductMaterialMigrationError(`Product ${product.sku} 的 BOM 必须各有且仅有一个主产出`)
    }
    if (primaryOutputIds.some((id) => id !== materialId)) {
      throw new ProductMaterialMigrationError(`Product ${product.sku} 的 BOM 主产出与人工映射冲突`)
    }
    if (stockRisk(stock)) throw new ProductMaterialMigrationError(`Product ${product.sku} 的独占库存非零或已有流水，禁止自动处理`)
    const expectedDisposition: StockDisposition = !stock
      ? 'NONE' : materialStock ? 'DELETE_EMPTY_PRODUCT_STOCK' : 'MOVE_EMPTY_PRODUCT_STOCK_TO_MATERIAL'
    if (mapping.decision.stockDisposition !== expectedDisposition) {
      throw new ProductMaterialMigrationError(`Product ${product.sku} 的库存处置应为 ${expectedDisposition}`)
    }
    const counts = {
      boms: boms.length, bomCostRuns: bomCostRuns.length, processRoutes: processRoutes.length,
      sawingScenarios: sawingScenarios.length, productionOrders: productionOrders.length,
      stockIns: stockIns.length, shipments: shipments.length, returns: returns.length,
      bomsWithoutSinglePrimaryOutput: boms.filter((bom) => bom.outputs.length !== 1).length,
    }
    for (const [key, count] of Object.entries(counts)) {
      if (mapping.dependencies[key] !== count) {
        throw new ProductMaterialMigrationError(`Product ${product.sku} 的 ${key} 引用数在确认后发生变化，请重新生成映射`)
      }
    }
    prepared.push({
      productId: product.id, materialId, stockId: stock?.id || null,
      stockDisposition: expectedDisposition,
      counts,
    })
  }

  const currentPlan = await buildProductMaterialMappingPlan(db)
  if (currentPlan.snapshotSha256 !== input.snapshotSha256) {
    throw new ProductMaterialMigrationError('映射计划生成后数据已变化，请重新生成并人工确认')
  }

  const changed = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const totals = {
      products: 0, boms: 0, bomCostRuns: 0, processRoutes: 0, sawingScenarios: 0,
      productionOrders: 0, stockIns: 0, shipments: 0, returns: 0,
      deletedEmptyProductStocks: 0, movedEmptyProductStocks: 0,
    }
    for (const item of prepared) {
      totals.products += (await tx.product.updateMany({ where: { id: item.productId, materialId: null }, data: { materialId: item.materialId } })).count
      totals.boms += (await tx.bOM.updateMany({ where: { productId: item.productId, materialId: null }, data: { materialId: item.materialId } })).count
      totals.bomCostRuns += (await tx.bomCostRun.updateMany({ where: { productId: item.productId, materialId: null }, data: { materialId: item.materialId } })).count
      totals.processRoutes += (await tx.processRoute.updateMany({ where: { productId: item.productId, materialId: null }, data: { materialId: item.materialId } })).count
      totals.sawingScenarios += (await tx.sawingCostScenario.updateMany({ where: { productId: item.productId, materialId: null }, data: { materialId: item.materialId } })).count
      totals.productionOrders += (await tx.productionOrder.updateMany({ where: { productId: item.productId, materialId: null }, data: { materialId: item.materialId } })).count
      totals.stockIns += (await tx.stockIn.updateMany({ where: { productId: item.productId, materialId: null }, data: { materialId: item.materialId } })).count
      totals.shipments += (await tx.shipment.updateMany({ where: { productId: item.productId, materialId: null }, data: { materialId: item.materialId } })).count
      totals.returns += (await tx.returnOrder.updateMany({ where: { productId: item.productId, materialId: null }, data: { materialId: item.materialId } })).count
      if (item.stockId && item.stockDisposition === 'DELETE_EMPTY_PRODUCT_STOCK') {
        await tx.stockLocationBalance.deleteMany({ where: { stockId: item.stockId } })
        await tx.stock.delete({ where: { id: item.stockId } })
        totals.deletedEmptyProductStocks += 1
      } else if (item.stockId && item.stockDisposition === 'MOVE_EMPTY_PRODUCT_STOCK_TO_MATERIAL') {
        await tx.stock.update({ where: { id: item.stockId }, data: { productId: null, materialId: item.materialId } })
        totals.movedEmptyProductStocks += 1
      }
    }
    return totals
  })

  return {
    confirmedBy: input.confirmation.confirmedBy.trim(),
    confirmedAt: new Date(input.confirmation.confirmedAt).toISOString(),
    mappings: prepared.map(({ productId, materialId, stockDisposition, counts }) => ({ productId, materialId, stockDisposition, counts })),
    changed,
  }
}
