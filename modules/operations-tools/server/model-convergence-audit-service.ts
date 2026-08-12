import { prisma } from '@/lib/prisma'
import { normalizeProductionOrderStatus, normalizeProductionOrderStatusDistribution } from '@/modules/production'

type ModelConvergenceDatabase = Pick<
  typeof prisma,
  | 'material'
  | 'product'
  | 'bOM'
  | 'bomCostRun'
  | 'processRoute'
  | 'sawingCostScenario'
  | 'productionOrder'
  | 'stock'
  | 'stockIn'
  | 'shipment'
  | 'returnOrder'
  | 'dailyProductionReport'
  | 'pickItem'
  | 'workReport'
>

const nonZero = (value: unknown) => Math.abs(Number(value || 0)) > 0.000001

export async function getModelConvergenceAudit(db: ModelConvergenceDatabase = prisma) {
  const [
    materials,
    products,
    productOnlyStocks,
    materialMissingStock,
    boms,
    bomCostRuns,
    processRoutes,
    sawingScenarios,
    productionOrders,
    ordersMissingMaterial,
    productionOrderStatusRows,
    stockIns,
    shipments,
    shipmentsMissingMaterial,
    returns,
    returnsMissingMaterial,
    dailyReports,
    pickItems,
    workReports,
  ] = await Promise.all([
    db.material.findMany({ where: { deletedAt: null }, select: { code: true } }),
    db.product.findMany({ select: { sku: true } }),
    db.stock.findMany({
      where: { productId: { not: null }, materialId: null },
      select: {
        qty: true,
        reservedQty: true,
        availableQty: true,
        valuationQty: true,
        reservedValuationQty: true,
        availableValuationQty: true,
        totalCost: true,
        logs: { select: { id: true }, take: 1 },
        locationBalances: { select: { qty: true, reservedQty: true, availableQty: true } },
      },
    }),
    db.material.count({ where: { deletedAt: null, stock: null } }),
    db.bOM.count(),
    db.bomCostRun.count(),
    db.processRoute.count(),
    db.sawingCostScenario.count({ where: { productId: { not: null } } }),
    db.productionOrder.count(),
    db.productionOrder.count({ where: { materialId: null } }),
    db.productionOrder.groupBy({ by: ['status'], _count: true }),
    db.stockIn.count(),
    db.shipment.count(),
    db.shipment.count({ where: { materialId: null } }),
    db.returnOrder.count(),
    db.returnOrder.count({ where: { materialId: null } }),
    db.dailyProductionReport.count(),
    db.pickItem.count(),
    db.workReport.count(),
  ])

  const materialCodes = new Set(materials.map((material) => material.code))
  const mappedProducts = products.filter((product) => (
    materialCodes.has(product.sku)
    || (product.sku.startsWith('MAT-') && materialCodes.has(product.sku.slice(4)))
  )).length
  const riskyProductOnlyStocks = productOnlyStocks.filter((stock) => (
    [
      stock.qty,
      stock.reservedQty,
      stock.availableQty,
      stock.valuationQty,
      stock.reservedValuationQty,
      stock.availableValuationQty,
      stock.totalCost,
    ].some(nonZero)
    || stock.logs.length > 0
    || stock.locationBalances.some((balance) => (
      nonZero(balance.qty) || nonZero(balance.reservedQty) || nonZero(balance.availableQty)
    ))
  )).length

  const blockers: string[] = []
  if (products.length - mappedProducts > 0) blockers.push('存在无法按编码唯一映射到 Material 的 Product')
  if (productOnlyStocks.length > 0) blockers.push('存在仍以 Product 为所有者的库存余额行')
  if (ordersMissingMaterial > 0) blockers.push('存在 materialId 为空的生产订单')
  if (shipmentsMissingMaterial > 0) blockers.push('存在 materialId 为空的发货单')
  if (returnsMissingMaterial > 0) blockers.push('存在 materialId 为空的退货单')
  const rawProductionOrderStatuses = productionOrderStatusRows.map((item) => ({
    status: item.status,
    count: item._count,
  }))

  return {
    products: {
      total: products.length,
      mappedByCode: mappedProducts,
      unmapped: products.length - mappedProducts,
    },
    productDependencies: {
      boms,
      bomCostRuns,
      processRoutes,
      sawingScenarios,
      productionOrders,
      stockIns,
      shipments,
      returns,
    },
    materialProjections: {
      ordersMissingMaterial,
      shipmentsMissingMaterial,
      returnsMissingMaterial,
    },
    productionOrderStatuses: {
      raw: rawProductionOrderStatuses,
      normalized: normalizeProductionOrderStatusDistribution(rawProductionOrderStatuses),
      legacyAliasRows: rawProductionOrderStatuses.reduce((count, item) => (
        count + (normalizeProductionOrderStatus(item.status) === item.status ? 0 : item.count)
      ), 0),
    },
    inventory: {
      materialMissingStock,
      productOnlyStocks: productOnlyStocks.length,
      riskyProductOnlyStocks,
    },
    legacyProduction: {
      dailyReports,
      pickItems,
      workReports,
      stockIns,
    },
    blockers,
    readyForProductForeignKeyMigration: blockers.length === 0,
  }
}
