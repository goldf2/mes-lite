import { prisma } from '@/lib/prisma'
import { normalizeProductionOrderStatusDistribution } from '@/modules/production'
import { buildProductionFlowDashboard } from '../domain/dashboard-production'
import type { PermissionMap } from '@/lib/permissions'
import { buildRoleTaskSections } from '../model/role-task-view'
import {
  materialReceiptDataScopeWhere,
  productionActualDataScopeWhere,
  productionOrderDataScopeWhere,
  qualityInspectionDataScopeWhere,
  returnDataScopeWhere,
  shipmentDataScopeWhere,
  stockDataScopeWhere,
  unrestrictedDataScope,
  type EffectiveDataScope,
} from '@/modules/identity-access'

const STOCK_BALANCE_FIELDS = [
  'qty',
  'reservedQty',
  'availableQty',
  'valuationQty',
  'reservedValuationQty',
  'availableValuationQty',
  'totalCost',
] as const

function hasStockBalance(stock: Record<string, unknown>) {
  return STOCK_BALANCE_FIELDS.some((field) => Math.abs(Number(stock[field] || 0)) > 0.000001)
}

export async function getDashboardData(now = new Date(), permissions?: PermissionMap, scope: EffectiveDataScope = unrestrictedDataScope) {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const [
    todayOrderCount,
    monthOrderCount,
    statusDistribution,
    todayProductionActualCount,
    monthProductionActualCount,
    productionActualStatusDistribution,
    todayProductionActualOutputAgg,
    monthProductionActualOutputAgg,
    pendingProductionActualCount,
    pendingMaterialInCount,
    pendingShipmentCount,
    pendingReturnCount,
    draftOrderCount,
    executableOrderCount,
    pendingQualityInspectionCount,
    qualityDispositionCount,
    pendingOperatorCount,
    lowStocks,
  ] = await Promise.all([
    prisma.productionOrder.count({ where: { createdAt: { gte: todayStart }, ...productionOrderDataScopeWhere(scope) } }),
    prisma.productionOrder.count({ where: { createdAt: { gte: monthStart }, ...productionOrderDataScopeWhere(scope) } }),
    prisma.productionOrder.groupBy({ by: ['status'], where: productionOrderDataScopeWhere(scope), _count: true }),
    prisma.productionOrderActual.count({ where: { actualDate: { gte: todayStart, lt: tomorrowStart }, status: { in: ['DRAFT', 'CONFIRMED'] }, ...productionActualDataScopeWhere(scope) } }),
    prisma.productionOrderActual.count({ where: { actualDate: { gte: monthStart, lt: nextMonthStart }, status: { in: ['DRAFT', 'CONFIRMED'] }, ...productionActualDataScopeWhere(scope) } }),
    prisma.productionOrderActual.groupBy({ by: ['status'], where: productionActualDataScopeWhere(scope), _count: true }),
    prisma.productionOrderActualOutput.aggregate({ where: { isPrimary: true, actual: { is: { actualDate: { gte: todayStart, lt: tomorrowStart }, status: 'CONFIRMED', ...productionActualDataScopeWhere(scope) } } }, _sum: { actualQty: true } }),
    prisma.productionOrderActualOutput.aggregate({ where: { isPrimary: true, actual: { is: { actualDate: { gte: monthStart, lt: nextMonthStart }, status: 'CONFIRMED', ...productionActualDataScopeWhere(scope) } } }, _sum: { actualQty: true } }),
    prisma.productionOrderActual.count({ where: { status: 'DRAFT', ...productionActualDataScopeWhere(scope) } }),
    prisma.materialReceipt.count({ where: { status: 'PENDING', deletedAt: null, ...materialReceiptDataScopeWhere(scope) } }),
    prisma.shipment.count({ where: { status: 'PENDING', ...shipmentDataScopeWhere(scope) } }),
    prisma.returnOrder.count({ where: { status: 'PENDING', ...returnDataScopeWhere(scope) } }),
    prisma.productionOrder.count({ where: { status: 'DRAFT', deletedAt: null, ...productionOrderDataScopeWhere(scope) } }),
    prisma.productionOrder.count({ where: { status: { in: ['RELEASED', 'IN_PROGRESS'] }, deletedAt: null, ...productionOrderDataScopeWhere(scope) } }),
    prisma.qualityInspection.count({ where: { status: 'PENDING', ...qualityInspectionDataScopeWhere(scope) } }),
    prisma.inventoryLot.count({ where: { status: 'OPEN', balances: { some: { inventoryStatus: { in: ['HOLD', 'REWORK'] }, stockQty: { gt: 0.000001 }, ...(scope.inventoryMode === 'LOCATIONS' ? { locationId: { in: scope.locationIds } } : {}) } } } }),
    prisma.operator.count({ where: { status: 'PENDING' } }),
    prisma.stock.findMany({
      where: {
        ...(scope.inventoryMode === 'ALL' ? { availableQty: { lt: 10 } } : {}),
        ...stockDataScopeWhere(scope),
      },
      include: {
        material: { select: { id: true, code: true, name: true, spec: true, unit: true, deletedAt: true } },
        product: { select: { id: true, sku: true, name: true, category: true, unit: true } },
        locationBalances: {
          where: scope.inventoryMode === 'LOCATIONS' ? { locationId: { in: scope.locationIds } } : undefined,
          select: { availableQty: true },
        },
      },
    }),
  ])

  return {
    ...buildProductionFlowDashboard({
      todayOrderCount,
      monthOrderCount,
      todayProductionActualCount,
      monthProductionActualCount,
      todayProductionActualOutput: todayProductionActualOutputAgg._sum.actualQty ?? 0,
      monthProductionActualOutput: monthProductionActualOutputAgg._sum.actualQty ?? 0,
    }),
    statusDistribution: normalizeProductionOrderStatusDistribution(
      statusDistribution.map((item) => ({ status: item.status, count: item._count })),
    ),
    productionActualStatusDistribution: productionActualStatusDistribution.map((item) => ({ status: item.status, count: item._count })),
    pendingProductionActualCount,
    pendingMaterialInCount,
    pendingShipmentCount,
    pendingReturnCount,
    roleTaskSections: permissions ? buildRoleTaskSections({
      draftOrderCount,
      executableOrderCount,
      pendingProductionActualCount,
      pendingQualityInspectionCount,
      qualityDispositionCount,
      pendingMaterialInCount,
      pendingShipmentCount,
      pendingReturnCount,
      pendingOperatorCount,
    }, permissions) : [],
    lowStocks: lowStocks.map((stock) => scope.inventoryMode === 'ALL' ? stock : ({
      ...stock,
      availableQty: stock.locationBalances.reduce((sum, balance) => sum + Number(balance.availableQty), 0),
      locationBalances: undefined,
    })).filter((stock) => Number(stock.availableQty) < 10)
      .filter((stock) => !stock.material?.deletedAt || hasStockBalance(stock)),
  }
}
