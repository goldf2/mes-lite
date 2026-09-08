import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { stockLogDataScopeWhere, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import { stockMovementTypeLabel } from '../model/stock-movement-view'
import type { StockMovementStatsQuery, StockMovementStatsWorkspace } from '../contracts/stock-movement-stats'

const DAY_MS = 86_400_000
const DEFAULT_DAYS = 30

function chinaDate(value: string | null | undefined, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+08:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function resolveStockMovementStatsRange(input: Pick<StockMovementStatsQuery, 'startDate' | 'endDate'>, now = new Date()) {
  const fallbackEnd = new Date(now)
  const fallbackStart = new Date(fallbackEnd.getTime() - (DEFAULT_DAYS - 1) * DAY_MS)
  const start = chinaDate(input.startDate) || new Date(`${fallbackStart.toISOString().slice(0, 10)}T00:00:00.000+08:00`)
  const end = chinaDate(input.endDate, true) || new Date(`${fallbackEnd.toISOString().slice(0, 10)}T23:59:59.999+08:00`)
  if (end.getTime() < start.getTime()) throw new Error('结束日期不能早于开始日期')
  return { start, end }
}

type Aggregate = {
  key: string
  label: string
  movementCount: number
  inQty: number
  outQty: number
  netQty: number
  netValuationQty: number
  netCostAmount: number
  stockUnit: string
  valuationUnit: string
}

function emptyAggregate(key: string, label: string, stockUnit = '', valuationUnit = ''): Aggregate {
  return { key, label, movementCount: 0, inQty: 0, outQty: 0, netQty: 0, netValuationQty: 0, netCostAmount: 0, stockUnit, valuationUnit }
}

function addAggregate(target: Aggregate, row: { count: number; qty: number; valuationQty: number; costAmount: number; stockUnit: string; valuationUnit: string }) {
  target.movementCount += row.count
  target.inQty += row.qty > 0 ? row.qty : 0
  target.outQty += row.qty < 0 ? Math.abs(row.qty) : 0
  target.netQty += row.qty
  target.netValuationQty += row.valuationQty
  target.netCostAmount += row.costAmount
  if (!target.stockUnit) target.stockUnit = row.stockUnit
  if (!target.valuationUnit) target.valuationUnit = row.valuationUnit
}

const round = (value: number, digits = 6) => Number(value.toFixed(digits))
const finalize = <T extends Aggregate>(item: T) => ({
  ...item,
  inQty: round(item.inQty), outQty: round(item.outQty), netQty: round(item.netQty),
  netValuationQty: round(item.netValuationQty), netCostAmount: round(item.netCostAmount, 2),
})

export async function getStockMovementStats(
  input: StockMovementStatsQuery,
  scope: EffectiveDataScope = unrestrictedDataScope,
  now = new Date(),
): Promise<StockMovementStatsWorkspace> {
  const { start, end } = resolveStockMovementStatsRange(input, now)
  const filters: Prisma.StockLogWhereInput[] = [
    { createdAt: { gte: start, lte: end } },
    stockLogDataScopeWhere(scope),
  ]
  if (input.materialId) filters.push({ stock: { materialId: input.materialId } })
  if (input.locationId) filters.push({ locationId: input.locationId })
  const where: Prisma.StockLogWhereInput = { AND: filters }
  const grouped = await prisma.stockLog.groupBy({
    by: ['type', 'stockId', 'locationId', 'refType'],
    where,
    _sum: { qty: true, valuationQty: true, costAmount: true },
    _count: true,
  })
  const stockIds = Array.from(new Set(grouped.map((row) => row.stockId)))
  const locationIds = Array.from(new Set(grouped.flatMap((row) => row.locationId ? [row.locationId] : [])))
  const [stocks, locations] = await Promise.all([
    prisma.stock.findMany({
      where: { id: { in: stockIds } },
      select: { id: true, material: { select: { id: true, code: true, name: true, spec: true, stockUnit: true, unit: true, valuationUnit: true } }, product: { select: { id: true, sku: true, name: true, unit: true } } },
    }),
    prisma.inventoryLocation.findMany({ where: { id: { in: locationIds } }, select: { id: true, code: true, name: true } }),
  ])
  const stockMap = new Map(stocks.map((stock) => [stock.id, stock]))
  const locationMap = new Map(locations.map((location) => [location.id, location]))
  const byType = new Map<string, Aggregate>()
  const byMaterial = new Map<string, Aggregate & { objectId: string; code: string; name: string; spec: string }>()
  const byLocation = new Map<string, Aggregate & { locationId: string; code: string; name: string }>()
  const summary = emptyAggregate('summary', '全部')
  let incomingInQty = 0
  let incomingOutQty = 0
  const stockUnits = new Set<string>()
  const incomingStockUnits = new Set<string>()

  for (const row of grouped) {
    const stock = stockMap.get(row.stockId)
    if (!stock) continue
    const material = stock.material
    const product = stock.product
    const stockUnit = material?.stockUnit || material?.unit || product?.unit || ''
    const valuationUnit = material?.valuationUnit || material?.unit || product?.unit || ''
    const aggregateRow = {
      count: row._count,
      qty: Number(row._sum.qty || 0),
      valuationQty: Number(row._sum.valuationQty || 0),
      costAmount: Number(row._sum.costAmount || 0),
      stockUnit,
      valuationUnit,
    }
    stockUnits.add(stockUnit)
    addAggregate(summary, aggregateRow)
    const typeKey = `${row.type}|${stockUnit}`
    const type = byType.get(typeKey) || emptyAggregate(typeKey, `${stockMovementTypeLabel(row.type)} · ${stockUnit || '未标单位'}`, stockUnit, valuationUnit)
    addAggregate(type, aggregateRow)
    byType.set(typeKey, type)
    const objectId = material?.id || product?.id
    if (objectId) {
      const object = byMaterial.get(objectId) || {
        ...emptyAggregate(objectId, material?.name || product?.name || '', stockUnit, valuationUnit),
        objectId, code: material?.code || product?.sku || '', name: material?.name || product?.name || '', spec: material?.spec || '',
      }
      addAggregate(object, aggregateRow)
      byMaterial.set(objectId, object)
    }
    if (row.locationId) {
      const location = locationMap.get(row.locationId)
      const locationKey = `${row.locationId}|${stockUnit}`
      const locationAggregate = byLocation.get(locationKey) || {
        ...emptyAggregate(locationKey, `${location ? `${location.code} · ${location.name}` : row.locationId} · ${stockUnit || '未标单位'}`, stockUnit, valuationUnit),
        locationId: row.locationId, code: location?.code || row.locationId, name: location?.name || '',
      }
      addAggregate(locationAggregate, aggregateRow)
      byLocation.set(locationKey, locationAggregate)
    }
    if (row.refType === 'MATERIAL_IN' || row.refType === 'MATERIAL_IN_REVERSE') {
      incomingStockUnits.add(stockUnit)
      incomingInQty += aggregateRow.qty > 0 ? aggregateRow.qty : 0
      incomingOutQty += aggregateRow.qty < 0 ? Math.abs(aggregateRow.qty) : 0
    }
  }

  return {
    range: { startDate: start.toISOString(), endDate: end.toISOString() },
    summary: {
      movementCount: summary.movementCount,
      stockUnits: Array.from(stockUnits).sort(),
      inQty: stockUnits.size <= 1 ? round(summary.inQty) : null,
      outQty: stockUnits.size <= 1 ? round(summary.outQty) : null,
      netQty: stockUnits.size <= 1 ? round(summary.netQty) : null,
      netValuationQty: stockUnits.size <= 1 ? round(summary.netValuationQty) : null,
      netCostAmount: round(summary.netCostAmount, 2),
      incomingInQty: incomingStockUnits.size <= 1 ? round(incomingInQty) : null,
      incomingOutQty: incomingStockUnits.size <= 1 ? round(incomingOutQty) : null,
      incomingNetQty: incomingStockUnits.size <= 1 ? round(incomingInQty - incomingOutQty) : null,
    },
    byType: Array.from(byType.values()).map(finalize).sort((a, b) => Math.abs(b.netQty) - Math.abs(a.netQty) || a.label.localeCompare(b.label)),
    byMaterial: Array.from(byMaterial.values()).map(finalize).sort((a, b) => Math.abs(b.netQty) - Math.abs(a.netQty) || a.code.localeCompare(b.code)).slice(0, 100),
    byLocation: Array.from(byLocation.values()).map(finalize).sort((a, b) => Math.abs(b.netQty) - Math.abs(a.netQty) || a.code.localeCompare(b.code)),
  }
}
