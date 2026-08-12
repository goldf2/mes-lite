import { prisma } from '@/lib/prisma'
import type { InventoryLotTrace, InventoryLotTraceNode, InventoryLotTraceRelation } from '../contracts/inventory-lot-trace'

const traceInclude = {
  material: { select: { id: true, code: true, name: true, stockUnit: true, unit: true } },
  materialIn: { include: { supplier: { select: { name: true } } } },
  productionOutput: { include: { actual: { include: { order: { select: { orderNo: true } } } } } },
  balances: { include: { location: { select: { id: true, code: true, name: true } } }, orderBy: { createdAt: 'asc' as const } },
  inspections: { orderBy: { createdAt: 'desc' as const } },
} as const

function toTraceNode(lot: Awaited<ReturnType<typeof loadLot>>): InventoryLotTraceNode {
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
      : lot.sourceType === 'LEGACY_INVENTORY'
        ? { type: 'LEGACY_INVENTORY' as const, number: '历史未追踪库存' }
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
    balances: lot.balances.map((balance) => ({
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
  return prisma.inventoryLot.findUnique({ where: { id }, include: traceInclude })
}

export async function getInventoryLotTrace(id: string): Promise<InventoryLotTrace> {
  const lot = await loadLot(id)
  if (!lot) throw new Error('内部批次不存在')
  const [parents, children] = await Promise.all([
    prisma.inventoryLotGenealogy.findMany({
      where: { childLotId: id, status: 'ACTIVE' },
      include: {
        parentLot: { include: traceInclude },
        inputAllocation: { include: { actualInput: true } },
        actual: { include: { order: { select: { orderNo: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.inventoryLotGenealogy.findMany({
      where: { parentLotId: id, status: 'ACTIVE' },
      include: {
        childLot: { include: traceInclude },
        inputAllocation: { include: { actualInput: true } },
        actual: { include: { order: { select: { orderNo: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  const upstream: InventoryLotTraceRelation[] = parents.map((item) => ({
    id: item.id,
    direction: 'UPSTREAM',
    stockQty: Number(item.inputAllocation.stockQty),
    materialCode: item.inputAllocation.actualInput.materialCode,
    materialName: item.inputAllocation.actualInput.materialName,
    actualNo: item.actual.actualNo,
    orderNo: item.actual.order.orderNo,
    lot: toTraceNode(item.parentLot),
  }))
  const downstream: InventoryLotTraceRelation[] = children.map((item) => ({
    id: item.id,
    direction: 'DOWNSTREAM',
    stockQty: Number(item.inputAllocation.stockQty),
    materialCode: item.inputAllocation.actualInput.materialCode,
    materialName: item.inputAllocation.actualInput.materialName,
    actualNo: item.actual.actualNo,
    orderNo: item.actual.order.orderNo,
    lot: toTraceNode(item.childLot),
  }))
  return { lot: toTraceNode(lot), upstream, downstream }
}
