import { prisma } from '@/lib/prisma'
import type {
  InventoryLotPanorama,
  InventoryLotPanoramaEdge,
  InventoryLotSearchResult,
} from '../contracts/inventory-lot-panorama'
import type { InventoryLotCustomerShipment } from '../contracts/inventory-lot-trace'
import { inventoryLotTraceInclude, loadInventoryLotTraceNodes } from './inventory-lot-trace-service'

const maxSearchResults = 100
const maxPanoramaLots = 300

function normalizeKeyword(value?: string) {
  return value?.trim().slice(0, 120) || ''
}

function matchedBy(lot: Awaited<ReturnType<typeof searchLotRows>>[number], keyword: string) {
  const needle = keyword.toLocaleLowerCase('zh-CN')
  const labels = new Set<string>()
  const match = (value: string | null | undefined) => Boolean(value?.toLocaleLowerCase('zh-CN').includes(needle))
  if (match(lot.lotNo)) labels.add('内部批号')
  if (match(lot.supplierLotNo)) labels.add('供应批号')
  if (match(lot.material.code) || match(lot.material.name)) labels.add('物料')
  if (match(lot.materialIn?.inboundNo) || match(lot.materialIn?.receipt?.inboundNo)) labels.add('来料单')
  if (match(lot.materialIn?.supplier.name) || match(lot.materialIn?.supplier.code)) labels.add('供应商')
  if (match(lot.productionOutput?.actual.actualNo) || match(lot.productionOutput?.actual.order.orderNo)) labels.add('生产单')
  if (lot.shipmentAllocations.some((item) => match(item.shipment.shipmentNo))) labels.add('发货单')
  if (lot.shipmentAllocations.some((item) => match(item.shipment.customer) || match(item.shipment.customerRef?.code))) labels.add('客户')
  if (lot.returnOrder && (match(lot.returnOrder.returnNo) || match(lot.returnOrder.shipment?.shipmentNo) || match(lot.returnOrder.shipment?.customer))) labels.add('退货单')
  if (lot.inspections.some((item) => match(item.inspectionNo))) labels.add('检验单')
  return Array.from(labels)
}

function searchLotRows(keyword: string) {
  return prisma.inventoryLot.findMany({
    where: {
      OR: [
        { lotNo: { contains: keyword } },
        { supplierLotNo: { contains: keyword } },
        { material: { OR: [{ code: { contains: keyword } }, { name: { contains: keyword } }] } },
        { materialIn: { inboundNo: { contains: keyword } } },
        { materialIn: { receipt: { inboundNo: { contains: keyword } } } },
        { materialIn: { supplier: { OR: [{ code: { contains: keyword } }, { name: { contains: keyword } }] } } },
        { productionOutput: { actual: { OR: [
          { actualNo: { contains: keyword } },
          { order: { orderNo: { contains: keyword } } },
        ] } } },
        { shipmentAllocations: { some: { status: 'ACTIVE', shipment: { OR: [
          { shipmentNo: { contains: keyword } },
          { customer: { contains: keyword } },
          { customerRef: { code: { contains: keyword } } },
        ] } } } },
        { returnOrder: { OR: [
          { returnNo: { contains: keyword } },
          { shipment: { shipmentNo: { contains: keyword } } },
          { shipment: { customer: { contains: keyword } } },
        ] } },
        { inspections: { some: { inspectionNo: { contains: keyword } } } },
      ],
    },
    include: {
      ...inventoryLotTraceInclude,
      materialIn: { include: { supplier: { select: { code: true, name: true } }, receipt: { select: { inboundNo: true } } } },
      shipmentAllocations: {
        where: { status: 'ACTIVE' },
        include: { shipment: { include: { customerRef: { select: { code: true } } } } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: [{ receivedAt: 'desc' }, { lotNo: 'asc' }],
    take: maxSearchResults + 1,
  })
}

export async function searchInventoryLots(input: { keyword?: string }): Promise<InventoryLotSearchResult> {
  const keyword = normalizeKeyword(input.keyword)
  if (!keyword) return { keyword, items: [], truncated: false }
  const rows = await searchLotRows(keyword)
  const nodesById = new Map((await loadInventoryLotTraceNodes(rows.slice(0, maxSearchResults).map((row) => row.id))).map((node) => [node.id, node]))
  return {
    keyword,
    truncated: rows.length > maxSearchResults,
    items: rows.slice(0, maxSearchResults).flatMap((row) => {
      const lot = nodesById.get(row.id)
      return lot ? [{ lot, matchedBy: matchedBy(row, keyword) }] : []
    }),
  }
}

function addEdge(map: Map<string, InventoryLotPanoramaEdge>, edge: InventoryLotPanoramaEdge) {
  map.set(`${edge.type}:${edge.id}`, edge)
}

export async function getInventoryLotPanorama(selectedLotId: string): Promise<InventoryLotPanorama> {
  const exists = await prisma.inventoryLot.findUnique({ where: { id: selectedLotId }, select: { id: true } })
  if (!exists) throw new Error('内部批次不存在')
  const generations = new Map<string, number>([[selectedLotId, 0]])
  const queue = [selectedLotId]
  const edgeMap = new Map<string, InventoryLotPanoramaEdge>()
  let truncated = false
  while (queue.length > 0) {
    const batch = queue.splice(0, 40)
    const [genealogies, returns] = await Promise.all([
      prisma.inventoryLotGenealogy.findMany({
        where: { status: 'ACTIVE', OR: [{ parentLotId: { in: batch } }, { childLotId: { in: batch } }] },
        include: { actual: { include: { order: { select: { orderNo: true } } } }, inputAllocation: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.returnLotAllocation.findMany({
        where: { status: 'ACTIVE', OR: [{ returnedLotId: { in: batch } }, { shipmentAllocation: { lotId: { in: batch } } }] },
        include: { returnOrder: true, shipmentAllocation: { include: { shipment: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ])
    const baseGenerations = new Map(batch.map((id) => [id, generations.get(id) || 0]))
    for (const item of genealogies) {
      addEdge(edgeMap, {
        id: item.id, type: 'PRODUCTION', sourceLotId: item.parentLotId, targetLotId: item.childLotId,
        stockQty: Number(item.inputAllocation.stockQty), documentNo: item.actual.order.orderNo,
        secondaryDocumentNo: item.actual.actualNo,
      })
    }
    for (const item of returns) {
      addEdge(edgeMap, {
        id: item.id, type: 'CUSTOMER_RETURN', sourceLotId: item.shipmentAllocation.lotId, targetLotId: item.returnedLotId,
        stockQty: Number(item.stockQty), documentNo: item.returnOrder.returnNo,
        secondaryDocumentNo: item.shipmentAllocation.shipment.shipmentNo,
        customer: item.shipmentAllocation.shipment.customer,
      })
    }
    for (const edge of Array.from(edgeMap.values())) {
      const sourceGeneration = baseGenerations.get(edge.sourceLotId)
      const targetGeneration = baseGenerations.get(edge.targetLotId)
      const candidate = sourceGeneration !== undefined
        ? [edge.targetLotId, sourceGeneration + 1] as const
        : targetGeneration !== undefined
          ? [edge.sourceLotId, targetGeneration - 1] as const
          : null
      if (!candidate || generations.has(candidate[0])) continue
      if (generations.size >= maxPanoramaLots) { truncated = true; continue }
      generations.set(candidate[0], candidate[1])
      queue.push(candidate[0])
    }
  }
  const lotIds = Array.from(generations.keys())
  const [lotNodes, shipmentRows] = await Promise.all([
    loadInventoryLotTraceNodes(lotIds),
    prisma.shipmentLotAllocation.findMany({
      where: { status: 'ACTIVE', lotId: { in: lotIds } },
      include: { shipment: { include: { customerRef: { select: { code: true } } } }, location: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  const customerShipments: InventoryLotCustomerShipment[] = shipmentRows.map((item) => ({
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
  const nodes = lotNodes.map((lot) => ({ lot, generation: generations.get(lot.id) || 0 }))
    .sort((left, right) => left.generation - right.generation || left.lot.receivedAt.localeCompare(right.lot.receivedAt) || left.lot.lotNo.localeCompare(right.lot.lotNo))
  const edges = Array.from(edgeMap.values()).filter((edge) => generations.has(edge.sourceLotId) && generations.has(edge.targetLotId))
  return {
    selectedLotId,
    nodes,
    edges,
    customerShipments,
    summary: {
      lots: nodes.length,
      relations: edges.length,
      supplierLots: nodes.filter((item) => Boolean(item.lot.supplierLotNo)).length,
      customers: new Set(customerShipments.map((item) => item.customerCode || item.customer)).size,
      qualityInspections: nodes.reduce((sum, item) => sum + item.lot.inspections.length, 0),
    },
    truncated,
  }
}
