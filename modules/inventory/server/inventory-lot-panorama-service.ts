import { prisma } from '@/lib/prisma'
import {
  assertInventoryLotDataScope,
  inventoryLotDataScopeWhere,
  unrestrictedDataScope,
  type EffectiveDataScope,
} from '@/modules/identity-access'
import type {
  InventoryLotPanorama,
  InventoryLotPanoramaEdge,
  InventoryLotSearchResult,
} from '../contracts/inventory-lot-panorama'
import type { InventoryLotCustomerShipment } from '../contracts/inventory-lot-trace'
import { inventoryLotTraceInclude, loadInventoryLotTraceNodes } from './inventory-lot-trace-service'
import type { Prisma } from '@prisma/client'
import { tokenizeKeywordQuery, type ResourceSearchCondition } from '@/lib/resource-search'

const maxSearchResults = 100
const maxPanoramaLots = 300

function normalizeKeyword(value?: string) {
  return value?.trim().slice(0, 120) || ''
}

function matchedBy(lot: Awaited<ReturnType<typeof searchLotRows>>[number], keyword: string) {
  if (!keyword) return ['高级条件']
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

function textFilter(condition: ResourceSearchCondition) {
  return condition.operator === 'equals' ? { equals: condition.value } : condition.operator === 'startsWith' ? { startsWith: condition.value } : { contains: condition.value }
}

function numberFilter(condition: ResourceSearchCondition) {
  const value = Number(condition.value)
  if (!Number.isFinite(value)) return { equals: Number.NaN }
  return condition.operator === 'gt' ? { gt: value } : condition.operator === 'gte' ? { gte: value } : condition.operator === 'lt' ? { lt: value } : condition.operator === 'lte' ? { lte: value } : { equals: value }
}

function dateFilter(condition: ResourceSearchCondition) {
  const start = new Date(`${condition.value}T00:00:00`)
  if (Number.isNaN(start.getTime())) return { equals: new Date(0) }
  const next = new Date(start.getTime() + 86_400_000)
  return condition.operator === 'gt' ? { gte: next } : condition.operator === 'gte' ? { gte: start } : condition.operator === 'lt' ? { lt: start } : condition.operator === 'lte' ? { lt: next } : { gte: start, lt: next }
}

function inventoryLotAdvancedWhere(condition: ResourceSearchCondition): Prisma.InventoryLotWhereInput {
  const text = textFilter(condition)
  if (condition.field === 'lotNo' || condition.field === 'supplierLotNo') return { [condition.field]: text }
  if (condition.field === 'material') return { material: { is: { OR: [{ code: text }, { name: text }, { stockUnit: text }, { unit: text }] } } }
  if (condition.field === 'sourceType') return { sourceType: text }
  if (condition.field === 'sourceDocument') return { OR: [{ sourceId: text }, { materialIn: { is: { inboundNo: text } } }, { materialIn: { is: { receipt: { is: { inboundNo: text } } } } }, { productionOutput: { is: { actual: { is: { OR: [{ actualNo: text }, { order: { is: { orderNo: text } } }] } } } } }, { shipmentAllocations: { some: { status: 'ACTIVE', shipment: { is: { shipmentNo: text } } } } }, { returnOrder: { is: { OR: [{ returnNo: text }, { shipment: { is: { shipmentNo: text } } }] } } }] }
  if (condition.field === 'supplier') return { materialIn: { is: { supplier: { is: { OR: [{ code: text }, { name: text }] } } } } }
  if (condition.field === 'customer') return { OR: [{ shipmentAllocations: { some: { status: 'ACTIVE', shipment: { is: { OR: [{ customer: text }, { customerRef: { is: { OR: [{ code: text }, { name: text }] } } }] } } } } }, { returnOrder: { is: { shipment: { is: { OR: [{ customer: text }, { customerRef: { is: { OR: [{ code: text }, { name: text }] } } }] } } } } }] }
  if (condition.field === 'location') return { balances: { some: { location: { is: { OR: [{ code: text }, { name: text }] } } } } }
  if (condition.field === 'inventoryStatus') return { balances: { some: { inventoryStatus: condition.value } } }
  if (condition.field === 'stockQty') return { balances: { some: { stockQty: numberFilter(condition) } } }
  if (condition.field === 'inspection') return { inspections: { some: { OR: [{ inspectionNo: text }, { status: text }, { result: text }, { inspector: text }, { note: text }] } } }
  if (condition.field === 'receivedAt') return { receivedAt: dateFilter(condition) }
  return { id: '__INVALID_SEARCH_FIELD__' }
}

function inventoryLotKeywordWhere(keyword: string): Prisma.InventoryLotWhereInput {
  const tokens = tokenizeKeywordQuery(keyword)
  return tokens.length ? { AND: tokens.map((value) => ({ OR: [
    { lotNo: { contains: value } }, { supplierLotNo: { contains: value } }, { sourceType: { contains: value } }, { sourceId: { contains: value } },
    { material: { is: { OR: [{ code: { contains: value } }, { name: { contains: value } }, { stockUnit: { contains: value } }, { unit: { contains: value } }] } } },
    { materialIn: { is: { OR: [{ inboundNo: { contains: value } }, { receipt: { is: { inboundNo: { contains: value } } } }, { supplier: { is: { OR: [{ code: { contains: value } }, { name: { contains: value } }] } } }] } } },
    { productionOutput: { is: { actual: { is: { OR: [{ actualNo: { contains: value } }, { order: { is: { orderNo: { contains: value } } } }] } } } } },
    { shipmentAllocations: { some: { status: 'ACTIVE', shipment: { is: { OR: [{ shipmentNo: { contains: value } }, { customer: { contains: value } }, { customerRef: { is: { OR: [{ code: { contains: value } }, { name: { contains: value } }] } } }] } } } } },
    { returnOrder: { is: { OR: [{ returnNo: { contains: value } }, { shipment: { is: { OR: [{ shipmentNo: { contains: value } }, { customer: { contains: value } }] } } }] } } },
    { balances: { some: { location: { is: { OR: [{ code: { contains: value } }, { name: { contains: value } }] } } } } },
    { inspections: { some: { OR: [{ inspectionNo: { contains: value } }, { inspector: { contains: value } }, { note: { contains: value } }] } } },
  ] })) } : {}
}

function searchLotRows(keyword: string, scope: EffectiveDataScope, advancedConditions: readonly ResourceSearchCondition[] = []) {
  return prisma.inventoryLot.findMany({
    where: {
      AND: [inventoryLotDataScopeWhere(scope), inventoryLotKeywordWhere(keyword), ...advancedConditions.map(inventoryLotAdvancedWhere)],
    },
    include: {
      ...inventoryLotTraceInclude,
      materialIn: { include: { supplier: { select: { code: true, name: true } }, receipt: { select: { inboundNo: true } } } },
      shipmentAllocations: {
        where: {
          status: 'ACTIVE',
          ...(scope.inventoryMode === 'LOCATIONS' ? { locationId: { in: scope.locationIds } } : {}),
        },
        include: { shipment: { include: { customerRef: { select: { code: true } } } } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: [{ receivedAt: 'desc' }, { lotNo: 'asc' }],
    take: maxSearchResults + 1,
  })
}

export async function searchInventoryLots(
  input: { keyword?: string; advancedConditions?: readonly ResourceSearchCondition[] },
  scope: EffectiveDataScope = unrestrictedDataScope,
): Promise<InventoryLotSearchResult> {
  const keyword = normalizeKeyword(input.keyword)
  if (!keyword && !input.advancedConditions?.length) return { keyword, items: [], truncated: false }
  const rows = await searchLotRows(keyword, scope, input.advancedConditions)
  const nodesById = new Map((await loadInventoryLotTraceNodes(rows.slice(0, maxSearchResults).map((row) => row.id), scope)).map((node) => [node.id, node]))
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

export async function getInventoryLotPanorama(
  selectedLotId: string,
  scope: EffectiveDataScope = unrestrictedDataScope,
): Promise<InventoryLotPanorama> {
  const exists = await prisma.inventoryLot.findUnique({
    where: { id: selectedLotId },
    include: { balances: { select: { locationId: true, stockQty: true } } },
  })
  if (!exists) throw new Error('内部批次不存在')
  assertInventoryLotDataScope(scope, exists)
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
  const discoveredLotIds = Array.from(generations.keys())
  const authorizedRows = await prisma.inventoryLot.findMany({
    where: { id: { in: discoveredLotIds }, ...inventoryLotDataScopeWhere(scope) },
    select: { id: true },
  })
  const authorizedIds = new Set(authorizedRows.map((item) => item.id))
  const authorizedEdges = Array.from(edgeMap.values()).filter((edge) => (
    authorizedIds.has(edge.sourceLotId) && authorizedIds.has(edge.targetLotId)
  ))
  const scopedGenerations = new Map<string, number>([[selectedLotId, 0]])
  const scopedQueue = [selectedLotId]
  while (scopedQueue.length > 0) {
    const currentId = scopedQueue.shift()!
    const generation = scopedGenerations.get(currentId) ?? 0
    for (const edge of authorizedEdges) {
      const candidate = edge.sourceLotId === currentId
        ? [edge.targetLotId, generation + 1] as const
        : edge.targetLotId === currentId
          ? [edge.sourceLotId, generation - 1] as const
          : null
      if (!candidate || scopedGenerations.has(candidate[0])) continue
      scopedGenerations.set(candidate[0], candidate[1])
      scopedQueue.push(candidate[0])
    }
  }
  const lotIds = Array.from(scopedGenerations.keys())
  const [lotNodes, shipmentRows] = await Promise.all([
    loadInventoryLotTraceNodes(lotIds, scope),
    prisma.shipmentLotAllocation.findMany({
      where: {
        status: 'ACTIVE',
        lotId: { in: lotIds },
        ...(scope.inventoryMode === 'LOCATIONS' ? { locationId: { in: scope.locationIds } } : {}),
      },
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
  const nodes = lotNodes.map((lot) => ({ lot, generation: scopedGenerations.get(lot.id) || 0 }))
    .sort((left, right) => left.generation - right.generation || left.lot.receivedAt.localeCompare(right.lot.receivedAt) || left.lot.lotNo.localeCompare(right.lot.lotNo))
  const edges = authorizedEdges.filter((edge) => scopedGenerations.has(edge.sourceLotId) && scopedGenerations.has(edge.targetLotId))
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
