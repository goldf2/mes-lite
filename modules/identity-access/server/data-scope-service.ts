import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  DataScopeError,
  type DataScopeActor,
  type EffectiveDataScope,
  isInventoryDataScopeMode,
  isProductionDataScopeMode,
} from '../domain/data-scope'

const impossibleId = '__NO_AUTHORIZED_SCOPE__'

export async function loadEffectiveDataScope(actor: DataScopeActor): Promise<EffectiveDataScope> {
  if (actor.role === 'ADMIN') {
    return {
      operatorId: actor.id, employeeId: null, employeeCode: null,
      productionMode: 'ALL', inventoryMode: 'ALL',
      workCenterIds: [], locationIds: [], inheritedLegacyDefault: false,
    }
  }
  const operator = await prisma.operator.findUnique({
    where: { id: actor.id },
    select: {
      employee: { select: { id: true, code: true } },
      dataScope: {
        include: {
          workCenters: { select: { workCenterId: true } },
          locations: { select: { locationId: true } },
        },
      },
    },
  })
  if (!operator) throw new DataScopeError('当前操作账号不存在')
  if (!operator.dataScope) {
    return {
      operatorId: actor.id, employeeId: operator.employee?.id ?? null, employeeCode: operator.employee?.code ?? null,
      productionMode: 'ALL', inventoryMode: 'ALL',
      workCenterIds: [], locationIds: [], inheritedLegacyDefault: true,
    }
  }
  if (!isProductionDataScopeMode(operator.dataScope.productionMode)
    || !isInventoryDataScopeMode(operator.dataScope.inventoryMode)) {
    throw new DataScopeError('账号数据范围配置无效，请联系权限管理员')
  }
  return {
    operatorId: actor.id,
    employeeId: operator.employee?.id ?? null,
    employeeCode: operator.employee?.code ?? null,
    productionMode: operator.dataScope.productionMode,
    inventoryMode: operator.dataScope.inventoryMode,
    workCenterIds: operator.dataScope.workCenters.map((item) => item.workCenterId),
    locationIds: operator.dataScope.locations.map((item) => item.locationId),
    inheritedLegacyDefault: false,
  }
}

export function dispatchDataScopeWhere(scope: EffectiveDataScope): Prisma.DispatchWhereInput {
  if (scope.productionMode === 'ALL') return {}
  if (scope.productionMode === 'SELF') return { employeeId: scope.employeeId ?? impossibleId }
  return { step: { is: { workCenterId: { in: scope.workCenterIds.length > 0 ? scope.workCenterIds : [impossibleId] } } } }
}

export function productionOrderDataScopeWhere(scope: EffectiveDataScope): Prisma.ProductionOrderWhereInput {
  if (scope.productionMode === 'ALL') return {}
  if (scope.productionMode === 'SELF') return { dispatches: { some: dispatchDataScopeWhere(scope) } }
  const ids = scope.workCenterIds.length > 0 ? scope.workCenterIds : [impossibleId]
  return {
    OR: [
      { dispatches: { some: dispatchDataScopeWhere(scope) } },
      { product: { is: { processRoutes: { some: { isDefault: true, steps: { some: { workCenterId: { in: ids } } } } } } } },
    ],
  }
}

export function flowTransferDataScopeWhere(scope: EffectiveDataScope): Prisma.FlowTransferWhereInput {
  if (scope.inventoryMode === 'ALL') return {}
  const ids = scope.locationIds.length > 0 ? scope.locationIds : [impossibleId]
  return { OR: [{ sourceLocationId: { in: ids } }, { targetLocationId: { in: ids } }] }
}

export function stockDataScopeWhere(scope: EffectiveDataScope): Prisma.StockWhereInput {
  if (scope.inventoryMode === 'ALL') return {}
  return { locationBalances: { some: { locationId: { in: scope.locationIds.length > 0 ? scope.locationIds : [impossibleId] } } } }
}

export function materialReceiptDataScopeWhere(scope: EffectiveDataScope): Prisma.MaterialReceiptWhereInput {
  if (scope.inventoryMode === 'ALL') return {}
  return { stagingLocationId: { in: scope.locationIds.length > 0 ? scope.locationIds : [impossibleId] } }
}

export function materialInDataScopeWhere(scope: EffectiveDataScope): Prisma.MaterialInWhereInput {
  if (scope.inventoryMode === 'ALL') return {}
  return { locationId: { in: scope.locationIds.length > 0 ? scope.locationIds : [impossibleId] } }
}

export function shipmentDataScopeWhere(scope: EffectiveDataScope): Prisma.ShipmentWhereInput {
  if (scope.inventoryMode === 'ALL') return {}
  const ids = scope.locationIds.length > 0 ? scope.locationIds : [impossibleId]
  return { AND: [{ items: { some: {} } }, { items: { every: { locationId: { in: ids } } } }] }
}

export function returnDataScopeWhere(scope: EffectiveDataScope): Prisma.ReturnOrderWhereInput {
  if (scope.inventoryMode === 'ALL') return {}
  return { locationId: { in: scope.locationIds.length > 0 ? scope.locationIds : [impossibleId] } }
}

export function stockLogDataScopeWhere(scope: EffectiveDataScope): Prisma.StockLogWhereInput {
  if (scope.inventoryMode === 'ALL') return {}
  return { locationId: { in: scope.locationIds.length > 0 ? scope.locationIds : [impossibleId] } }
}

export function productionActualDataScopeWhere(scope: EffectiveDataScope): Prisma.ProductionOrderActualWhereInput {
  if (scope.productionMode === 'ALL') return {}
  if (scope.productionMode === 'SELF') {
    return { employees: { some: { employeeId: scope.employeeId ?? impossibleId } } }
  }
  return { order: { is: productionOrderDataScopeWhere(scope) } }
}

export function workReportDataScopeWhere(scope: EffectiveDataScope): Prisma.WorkReportWhereInput {
  if (scope.productionMode === 'ALL') return {}
  if (scope.productionMode === 'SELF') return { workerId: scope.employeeCode ?? impossibleId }
  return { step: { is: { workCenterId: { in: scope.workCenterIds.length > 0 ? scope.workCenterIds : [impossibleId] } } } }
}

export function qualityInspectionDataScopeWhere(scope: EffectiveDataScope): Prisma.QualityInspectionWhereInput {
  if (scope.inventoryMode === 'ALL') return {}
  const ids = scope.locationIds.length > 0 ? scope.locationIds : [impossibleId]
  return { lot: { is: { balances: { some: { locationId: { in: ids }, stockQty: { gt: 0.000001 } } } } } }
}

export function inventoryLotDataScopeWhere(scope: EffectiveDataScope): Prisma.InventoryLotWhereInput {
  if (scope.inventoryMode === 'ALL') return {}
  const ids = scope.locationIds.length > 0 ? scope.locationIds : [impossibleId]
  return { balances: { some: { locationId: { in: ids } } } }
}

export function assertDispatchDataScope(
  scope: EffectiveDataScope,
  dispatch: { employeeId?: string | null; step?: { workCenterId?: string | null } | null },
) {
  if (scope.productionMode === 'ALL') return
  if (scope.productionMode === 'SELF' && scope.employeeId && dispatch.employeeId === scope.employeeId) return
  if (scope.productionMode === 'WORK_CENTERS' && dispatch.step?.workCenterId
    && scope.workCenterIds.includes(dispatch.step.workCenterId)) return
  throw new DataScopeError('派工任务不在当前账号的生产数据范围内')
}

export function assertProductionAssignmentDataScope(
  scope: EffectiveDataScope,
  input: { employeeId: string; workCenterId?: string | null },
) {
  if (scope.productionMode === 'ALL') return
  if (scope.productionMode === 'SELF') {
    if (scope.employeeId && input.employeeId === scope.employeeId) return
    throw new DataScopeError('本人范围账号只能为绑定员工创建派工')
  }
  if (input.workCenterId && scope.workCenterIds.includes(input.workCenterId)) return
  throw new DataScopeError('所选工序不在当前账号的工作中心范围内')
}

export function assertInventoryLocationDataScope(scope: EffectiveDataScope, locationIds: Array<string | null | undefined>) {
  if (scope.inventoryMode === 'ALL') return
  const requested = locationIds.filter((id): id is string => Boolean(id))
  if (requested.length === locationIds.length && requested.every((id) => scope.locationIds.includes(id))) return
  throw new DataScopeError('所选库位不在当前账号的库存数据范围内')
}

export function assertUnrestrictedInventoryDataScope(scope: EffectiveDataScope) {
  if (scope.inventoryMode !== 'ALL') throw new DataScopeError('该操作影响全厂库存，仅全厂库位范围账号可以执行')
}

export function assertProductionOrderDataScope(
  scope: EffectiveDataScope,
  order: {
    dispatches?: Array<{ employeeId?: string | null; step?: { workCenterId?: string | null } | null }>
    product?: { processRoutes?: Array<{ steps?: Array<{ workCenterId?: string | null }> }> } | null
  },
) {
  if (scope.productionMode === 'ALL') return
  if (order.dispatches?.some((dispatch) => {
    if (scope.productionMode === 'SELF') return Boolean(scope.employeeId && dispatch.employeeId === scope.employeeId)
    return Boolean(dispatch.step?.workCenterId && scope.workCenterIds.includes(dispatch.step.workCenterId))
  })) return
  if (scope.productionMode === 'WORK_CENTERS' && order.product?.processRoutes?.some((route) => (
    route.steps?.some((step) => Boolean(step.workCenterId && scope.workCenterIds.includes(step.workCenterId)))
  ))) return
  throw new DataScopeError('生产订单不在当前账号的生产数据范围内')
}

export async function assertProductionOrderIdDataScope(scope: EffectiveDataScope, orderId: string) {
  if (scope.productionMode === 'ALL') return
  const authorized = await prisma.productionOrder.findFirst({
    where: { id: orderId, ...productionOrderDataScopeWhere(scope) },
    select: { id: true },
  })
  if (!authorized) throw new DataScopeError('生产订单不在当前账号的生产数据范围内')
}

export function assertProductionActualDataScope(
  scope: EffectiveDataScope,
  actual: {
    employees?: Array<{ employeeId?: string | null }>
    order?: Parameters<typeof assertProductionOrderDataScope>[1] | null
  },
) {
  if (scope.productionMode === 'ALL') return
  if (scope.productionMode === 'SELF') {
    if (scope.employeeId && actual.employees?.some((item) => item.employeeId === scope.employeeId)) return
    throw new DataScopeError('生产实绩不在当前账号的本人数据范围内')
  }
  if (actual.order) return assertProductionOrderDataScope(scope, actual.order)
  throw new DataScopeError('生产实绩不在当前账号的工作中心范围内')
}

export function assertInventoryLotDataScope(
  scope: EffectiveDataScope,
  lot: { balances?: Array<{ locationId?: string | null; stockQty?: number | string | { toString(): string } }> },
) {
  if (scope.inventoryMode === 'ALL') return
  if (lot.balances?.some((balance) => (
    Boolean(balance.locationId && scope.locationIds.includes(balance.locationId))
  ))) return
  throw new DataScopeError('内部批次不在当前账号的库存数据范围内')
}

export function allowedInventoryLocationIds(scope: EffectiveDataScope) {
  return scope.inventoryMode === 'ALL' ? null : scope.locationIds
}
