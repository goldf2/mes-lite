import { prisma } from '@/lib/prisma'
import {
  assertInventoryLotDataScope,
  inventoryLotDataScopeWhere,
  unrestrictedDataScope,
  type EffectiveDataScope,
} from '@/modules/identity-access'
import type { InventoryLotCustomerReturn, InventoryLotCustomerShipment, InventoryLotTrace, InventoryLotTraceNode, InventoryLotTraceRelation } from '../contracts/inventory-lot-trace'

export const inventoryLotTraceInclude = {
  material: { select: { id: true, code: true, name: true, stockUnit: true, unit: true } },
  materialIn: { include: { supplier: { select: { name: true } } } },
  productionOutput: { include: { actual: { include: { order: { select: { orderNo: true } } } } } },
  returnOrder: { include: { shipment: { select: { shipmentNo: true, customer: true } } } },
  shipmentAllocations: {
    where: { status: 'ACTIVE' },
    include: { shipment: { select: { shipmentNo: true, customer: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  balances: { include: { location: { select: { id: true, code: true, name: true } } }, orderBy: { createdAt: 'asc' as const } },
  inspections: { orderBy: { createdAt: 'desc' as const } },
} as const

export function toInventoryLotTraceNode(
  lot: Awaited<ReturnType<typeof loadLot>>,
  scope: EffectiveDataScope = unrestrictedDataScope,
): InventoryLotTraceNode {
  if (!lot) throw new Error('内部批次不存在')
  const sourceDocument = lot.materialIn
    ? { type: 'MATERIAL_IN' as const, number: lot.materialIn.inboundNo, supplier: lot.materialIn.supplier.name }
    : lot.productionOutput
      ? {
          type: 'PRODUCTION_ORDER_ACTUAL_OUTPUT' as const,
          number: lot.productionOutput.actual.actualNo,
          productionOrder: lot.productionOutput.actual.order.orderNo,
          actualNo: lot.productionOutput.actual.actualNo,
        }
      : lot.returnOrder
        ? {
            type: 'RETURN_ORDER' as const,
            number: lot.returnOrder.returnNo,
            shipmentNo: lot.returnOrder.shipment?.shipmentNo || null,
            customer: lot.returnOrder.shipment?.customer || null,
          }
      : lot.sourceType === 'LEGACY_INVENTORY'
        ? { type: 'LEGACY_INVENTORY' as const, number: '历史未追踪库存' }
        : lot.sourceType === 'LEGACY_SHIPMENT'
          ? {
              type: 'LEGACY_SHIPMENT' as const,
              number: lot.shipmentAllocations[0]?.shipment.shipmentNo || lot.sourceId,
              customer: lot.shipmentAllocations[0]?.shipment.customer || null,
            }
        : { type: 'OTHER' as const, number: lot.sourceId }
  return {
    id: lot.id,
    lotNo: lot.lotNo,
    material: lot.material,
    sourceType: lot.sourceType,
    sourceId: lot.sourceId,
    supplierLotNo: lot.supplierLotNo,
    status: lot.status,
    receivedAt: lot.receivedAt.toISOString(),
    sourceDocument,
    balances: lot.balances.filter((balance) => (
      scope.inventoryMode === 'ALL' || scope.locationIds.includes(balance.locationId)
    )).map((balance) => ({
      location: balance.location,
      inventoryStatus: balance.inventoryStatus,
      stockQty: Number(balance.stockQty),
      valuationQty: Number(balance.valuationQty),
      costAmount: Number(balance.costAmount),
    })),
    inspections: lot.inspections.map((inspection) => ({
      inspectionNo: inspection.inspectionNo,
      status: inspection.status,
      result: inspection.result,
      sampleQty: Number(inspection.sampleQty),
      goodQty: Number(inspection.goodQty),
      badQty: Number(inspection.badQty),
      inspector: inspection.inspector,
      checkedAt: inspection.checkedAt?.toISOString() || null,
      note: inspection.note,
    })),
  }
}

function loadLot(id: string) {
  return prisma.inventoryLot.findUnique({ where: { id }, include: inventoryLotTraceInclude })
}

export async function loadInventoryLotTraceNodes(ids: string[], scope: EffectiveDataScope = unrestrictedDataScope) {
  if (ids.length === 0) return []
  const lots = await prisma.inventoryLot.findMany({
    where: { id: { in: ids }, ...inventoryLotDataScopeWhere(scope) },
    include: inventoryLotTraceInclude,
    orderBy: [{ receivedAt: 'asc' }, { lotNo: 'asc' }],
  })
  return lots.map((lot) => toInventoryLotTraceNode(lot, scope))
}

function lotIsAuthorized(scope: EffectiveDataScope, lot: { balances: Array<{ locationId: string; stockQty: unknown }> }) {
  return scope.inventoryMode === 'ALL' || lot.balances.some((balance) => scope.locationIds.includes(balance.locationId))
}

export async function getInventoryLotTrace(
  id: string,
  scope: EffectiveDataScope = unrestrictedDataScope,
): Promise<InventoryLotTrace> {
  const lot = await loadLot(id)
  if (!lot) throw new Error('内部批次不存在')
  assertInventoryLotDataScope(scope, lot)
  const [parents, children, shipmentAllocations, returnSourcesData, returnDescendantsData] = await Promise.all([
    prisma.inventoryLotGenealogy.findMany({
      where: { childLotId: id, status: 'ACTIVE' },
      include: {
        parentLot: { include: inventoryLotTraceInclude },
        inputAllocation: { include: { actualInput: true } },
        actual: { include: { order: { select: { orderNo: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.inventoryLotGenealogy.findMany({
      where: { parentLotId: id, status: 'ACTIVE' },
      include: {
        childLot: { include: inventoryLotTraceInclude },
        inputAllocation: { include: { actualInput: true } },
        actual: { include: { order: { select: { orderNo: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.shipmentLotAllocation.findMany({
      where: { lotId: id, status: 'ACTIVE' },
      include: {
        shipment: { include: { customerRef: { select: { code: true } } } },
        location: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.returnLotAllocation.findMany({
      where: { returnedLotId: id, status: 'ACTIVE' },
      include: {
        returnOrder: true,
        shipmentAllocation: {
          include: {
            lot: { include: inventoryLotTraceInclude },
            shipment: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.returnLotAllocation.findMany({
      where: { shipmentAllocation: { lotId: id }, status: 'ACTIVE' },
      include: {
        returnOrder: true,
        shipmentAllocation: { include: { shipment: true } },
        returnedLot: { include: inventoryLotTraceInclude },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  const upstream: InventoryLotTraceRelation[] = parents.filter((item) => lotIsAuthorized(scope, item.parentLot)).map((item) => ({
    id: item.id,
    direction: 'UPSTREAM',
    stockQty: Number(item.inputAllocation.stockQty),
    materialCode: item.inputAllocation.actualInput.materialCode,
    materialName: item.inputAllocation.actualInput.materialName,
    actualNo: item.actual.actualNo,
    orderNo: item.actual.order.orderNo,
    lot: toInventoryLotTraceNode(item.parentLot, scope),
  }))
  const downstream: InventoryLotTraceRelation[] = children.filter((item) => lotIsAuthorized(scope, item.childLot)).map((item) => ({
    id: item.id,
    direction: 'DOWNSTREAM',
    stockQty: Number(item.inputAllocation.stockQty),
    materialCode: item.inputAllocation.actualInput.materialCode,
    materialName: item.inputAllocation.actualInput.materialName,
    actualNo: item.actual.actualNo,
    orderNo: item.actual.order.orderNo,
    lot: toInventoryLotTraceNode(item.childLot, scope),
  }))
  const customerShipments: InventoryLotCustomerShipment[] = shipmentAllocations.filter((item) => (
    scope.inventoryMode === 'ALL' || scope.locationIds.includes(item.locationId)
  )).map((item) => ({
    id: item.id,
    lotId: item.lotId,
    shipmentId: item.shipmentId,
    shipmentNo: item.shipment.shipmentNo,
    customer: item.shipment.customer,
    customerCode: item.shipment.customerRef?.code || null,
    status: item.shipment.status,
    shippedAt: item.shipment.shippedAt?.toISOString() || null,
    trackingNo: item.shipment.trackingNo,
    stockQty: Number(item.stockQty),
    returnedStockQty: Number(item.returnedStockQty),
    location: item.location,
  }))
  const returnSources: InventoryLotCustomerReturn[] = returnSourcesData.filter((item) => (
    lotIsAuthorized(scope, item.shipmentAllocation.lot)
    && (scope.inventoryMode === 'ALL' || scope.locationIds.includes(item.shipmentAllocation.locationId))
  )).map((item) => ({
    id: item.id,
    direction: 'SOURCE',
    returnOrderId: item.returnOrderId,
    returnNo: item.returnOrder.returnNo,
    status: item.returnOrder.status,
    processedAt: item.returnOrder.processedAt?.toISOString() || null,
    reason: item.returnOrder.reason,
    shipmentNo: item.shipmentAllocation.shipment.shipmentNo,
    customer: item.shipmentAllocation.shipment.customer,
    stockQty: Number(item.stockQty),
    lot: toInventoryLotTraceNode(item.shipmentAllocation.lot, scope),
  }))
  const returnDescendants: InventoryLotCustomerReturn[] = returnDescendantsData.filter((item) => (
    lotIsAuthorized(scope, item.returnedLot)
    && (scope.inventoryMode === 'ALL' || scope.locationIds.includes(item.shipmentAllocation.locationId))
  )).map((item) => ({
    id: item.id,
    direction: 'DESCENDANT',
    returnOrderId: item.returnOrderId,
    returnNo: item.returnOrder.returnNo,
    status: item.returnOrder.status,
    processedAt: item.returnOrder.processedAt?.toISOString() || null,
    reason: item.returnOrder.reason,
    shipmentNo: item.shipmentAllocation.shipment.shipmentNo,
    customer: item.shipmentAllocation.shipment.customer,
    stockQty: Number(item.stockQty),
    lot: toInventoryLotTraceNode(item.returnedLot, scope),
  }))
  return { lot: toInventoryLotTraceNode(lot, scope), upstream, downstream, customerShipments, returnSources, returnDescendants }
}
