import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveInventoryLocation } from '@/modules/inventory'
import { normalizeMaterialInPriceUnit, resolveMaterialInPricing } from '@/lib/material-in-quantity'
import { tokenizeKeywordQuery, type ResourceSearchCondition } from '@/lib/resource-search'
import { resolveMaterialUnits } from '@/lib/units'
import type { CreateMaterialInInput, MaterialInItemInput } from '../contracts/material-in-schema'
import { MaterialInDomainError, runMaterialInDomainOperation } from '../domain/material-in-errors'
import { materialInNumberPrefix, nextMaterialInNumber } from '../domain/material-in-numbering'
import { loadMaterialInConversionHistory, materialInHistoryMinimumSamples } from './material-in-conversion-history-service'
import { assertInventoryLocationDataScope, materialReceiptDataScopeWhere, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import { materialInStatusOptions } from '../model/material-in-view'

export interface MaterialInListQuery {
  exportAll?: boolean
  statuses: string[]
  keyword?: string | null
  supplierId?: string | null
  customerId?: string | null
  advancedConditions?: ResourceSearchCondition[]
  page: number
  pageSize: number
  startDate?: string | null
  endDate?: string | null
  includeArchived?: boolean
  includeSummary?: boolean
}

export function materialInInclude() {
  return {
    supplier: true,
    location: true,
    inventoryLot: {
      include: {
        balances: { orderBy: { createdAt: 'asc' as const } },
        inspections: {
          orderBy: [{ round: 'desc' as const }, { createdAt: 'desc' as const }],
          select: {
            id: true, inspectionNo: true, sourceType: true, sourceId: true, round: true,
            status: true, result: true, standardCodeSnapshot: true, standardVersionSnapshot: true,
            standardNameSnapshot: true, suggestedSampleQty: true, inspectedQty: true,
          },
        },
      },
    },
    material: { include: { customer: { select: { id: true, code: true, name: true } } } },
  } satisfies Prisma.MaterialInInclude
}

export function materialReceiptInclude() {
  return {
    supplier: true,
    stagingLocation: true,
    lines: { orderBy: { lineNo: 'asc' as const }, include: materialInInclude() },
  } satisfies Prisma.MaterialReceiptInclude
}

export type MaterialReceiptWithLines = Prisma.MaterialReceiptGetPayload<{ include: ReturnType<typeof materialReceiptInclude> }>

export function toMaterialInRecord(receipt: MaterialReceiptWithLines) {
  return {
    ...receipt,
    locationId: receipt.stagingLocationId,
    location: receipt.stagingLocation,
    items: receipt.lines,
    itemCount: receipt.lines.length,
    totalAmount: Number(receipt.lines.reduce((sum, line) => sum + Number(line.totalAmount), 0).toFixed(2)),
  }
}

function numberMatches(actual: number, condition: ResourceSearchCondition) {
  const expected = Number(condition.value)
  if (!Number.isFinite(expected)) return false
  if (condition.operator === 'gt') return actual > expected
  if (condition.operator === 'gte') return actual >= expected
  if (condition.operator === 'lt') return actual < expected
  if (condition.operator === 'lte') return actual <= expected
  return actual === expected
}

async function receiptIdsByLineAggregate(condition: ResourceSearchCondition) {
  const rows = await prisma.materialIn.groupBy({
    by: ['receiptId'],
    where: { receiptId: { not: null }, deletedAt: null },
    _count: { id: true },
    _sum: { totalAmount: true },
  })
  return rows.flatMap((row) => {
    const actual = condition.field === 'itemCount' ? row._count.id : Number(row._sum.totalAmount || 0)
    return row.receiptId && numberMatches(actual, condition) ? [row.receiptId] : []
  })
}

export async function listMaterialIns(query: MaterialInListQuery, scope: EffectiveDataScope = unrestrictedDataScope) {
  const page = Math.max(1, Number.isFinite(query.page) ? Math.floor(query.page) : 1)
  const pageSize = Math.min(100, Math.max(1, Number.isFinite(query.pageSize) ? Math.floor(query.pageSize) : 20))
  const where: Prisma.MaterialReceiptWhereInput = query.includeArchived ? {} : { deletedAt: null }
  const dateBoundary = (value: string | null | undefined) => {
    if (!value) return undefined
    const date = new Date(`${value}T00:00:00+08:00`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || new Date(date.getTime() + 28_800_000).toISOString().slice(0, 10) !== value) throw new MaterialInDomainError('来料日期无效')
    return date
  }
  const start = dateBoundary(query.startDate)
  const end = dateBoundary(query.endDate)
  if (start && end && start > end) throw new MaterialInDomainError('结束日期不能早于开始日期')
  if (start || end) where.inboundDate = { gte: start, lt: end ? new Date(end.getTime() + 86_400_000) : undefined }
  const andConditions: Prisma.MaterialReceiptWhereInput[] = []
  andConditions.push(materialReceiptDataScopeWhere(scope))
  if (query.statuses.length === 1) where.status = query.statuses[0]
  else if (query.statuses.length > 1) where.status = { in: query.statuses }
  if (query.supplierId) where.supplierId = query.supplierId
  if (query.customerId === '__UNASSIGNED__') andConditions.push({ lines: { some: { material: { is: { customerId: null } } } } })
  else if (query.customerId) andConditions.push({ lines: { some: { material: { is: { customerId: query.customerId } } } } })
  for (const condition of query.advancedConditions || []) {
    const stringFilter = condition.operator === 'equals' ? { equals: condition.value } : condition.operator === 'startsWith' ? { startsWith: condition.value } : { contains: condition.value }
    if (['inboundNo', 'voucherNo', 'receivedBy', 'note'].includes(condition.field)) {
      andConditions.push({ [condition.field]: stringFilter } as Prisma.MaterialReceiptWhereInput)
    } else if (condition.field === 'status') andConditions.push({ status: condition.value })
    else if (condition.field === 'supplierId') andConditions.push({ supplierId: condition.value })
    else if (condition.field === 'customerId') andConditions.push({ lines: { some: { material: { is: { customerId: condition.value === '__UNASSIGNED__' ? null : condition.value } } } } })
    else if (condition.field === 'material') andConditions.push({ lines: { some: { material: { is: { OR: [{ code: stringFilter }, { name: stringFilter }, { spec: stringFilter }] } } } } })
    else if (condition.field === 'batchNo') andConditions.push({ lines: { some: { batchNo: stringFilter } } })
    else if (condition.field === 'locationId') andConditions.push({ stagingLocationId: condition.value })
    else if (condition.field === 'totalAmount' || condition.field === 'itemCount') {
      andConditions.push({ id: { in: await receiptIdsByLineAggregate(condition) } })
    }
    else if (condition.field === 'inboundDate') {
      const start = new Date(`${condition.value}T00:00:00+08:00`)
      if (!Number.isNaN(start.getTime())) andConditions.push({ inboundDate: { gte: start, lt: new Date(start.getTime() + 86_400_000) } })
    }
  }
  const keywordFilters = await Promise.all(tokenizeKeywordQuery(query.keyword || '').map(async (token): Promise<Prisma.MaterialReceiptWhereInput> => {
    const number = Number(token)
    const aggregateIds = Number.isFinite(number)
      ? Array.from(new Set([...(await receiptIdsByLineAggregate({ id: 'keyword-total', field: 'totalAmount', operator: 'equals', value: token })), ...(await receiptIdsByLineAggregate({ id: 'keyword-count', field: 'itemCount', operator: 'equals', value: token }))]))
      : []
    const date = /^\d{4}-\d{2}-\d{2}$/.test(token) ? new Date(`${token}T00:00:00+08:00`) : null
    return { OR: [
    { inboundNo: { contains: token } },
    { voucherNo: { contains: token } },
    { receivedBy: { contains: token } },
    { note: { contains: token } },
    { supplier: { is: { code: { contains: token } } } },
    { supplier: { is: { name: { contains: token } } } },
    { stagingLocation: { is: { code: { contains: token } } } }, { stagingLocation: { is: { name: { contains: token } } } },
    { lines: { some: { batchNo: { contains: token } } } },
    { lines: { some: { material: { is: { code: { contains: token } } } } } },
    { lines: { some: { material: { is: { name: { contains: token } } } } } },
    { lines: { some: { material: { is: { spec: { contains: token } } } } } },
    { lines: { some: { material: { is: { customer: { is: { OR: [{ code: { contains: token } }, { name: { contains: token } }] } } } } } } },
    ...materialInStatusOptions.filter((option) => option.label.includes(token)).map((option) => ({ status: option.value })),
    ...(aggregateIds.length > 0 ? [{ id: { in: aggregateIds } }] : []),
    ...(date && !Number.isNaN(date.getTime()) ? [{ inboundDate: { gte: date, lt: new Date(date.getTime() + 86_400_000) } }] : []),
  ] }
  }))
  andConditions.push(...keywordFilters)
  if (andConditions.length > 0) where.AND = andConditions

  const [receipts, total, summaryRows] = await prisma.$transaction(async (tx) => Promise.all([
    tx.materialReceipt.findMany({
      where,
      include: materialReceiptInclude(),
      orderBy: [{ inboundDate: 'desc' }, { id: 'desc' }],
      skip: query.exportAll ? undefined : (page - 1) * pageSize,
      take: query.exportAll ? undefined : pageSize,
    }),
    tx.materialReceipt.count({ where }),
    tx.materialIn.groupBy({
      by: ['status', 'unit'],
      where: query.includeSummary ? { receipt: { is: where } } : { id: '__NO_SUMMARY__' },
      _sum: { qty: true, totalAmount: true }, _count: { id: true },
    }),
  ]))

  return {
    items: receipts.map(toMaterialInRecord),
    summary: summaryRows.map((row) => ({ status: row.status, unit: row.unit, lineCount: row._count.id, qty: Number((row._sum.qty || 0).toFixed(6)), amount: Number((row._sum.totalAmount || 0).toFixed(2)) })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}

export async function buildMaterialInLineData(
  tx: Prisma.TransactionClient,
  input: MaterialInItemInput,
  stagingLocationId?: string | null,
  scope: EffectiveDataScope = unrestrictedDataScope,
) {
  const material = await tx.material.findFirst({ where: { id: input.materialId, deletedAt: null } })
  if (!material) throw new MaterialInDomainError('物料不存在或已归档', 404)

  const location = await resolveInventoryLocation(tx, stagingLocationId)
  const qty = Number(input.qty)
  if (!Number.isFinite(qty) || qty <= 0) throw new MaterialInDomainError('主库存数量必须大于 0')
  const units = resolveMaterialUnits(material)
  const stockUnit = units.stockUnit
  const materialUsesDualUnit = Boolean(
    material.referenceMeasure
      && material.referenceMeasure !== material.primaryMeasure
      && units.stockUnit !== units.valuationUnit,
  )
  const calculatedLength = input.lengthPerPiece !== undefined
  if (calculatedLength && (!materialUsesDualUnit || material.referenceMeasure !== 'LENGTH'
    || !Number.isInteger(input.pieceCount) || Number(input.pieceCount) <= 0)) {
    throw new MaterialInDomainError('按根数计算仅适用于长度辅助单位，且根数必须为正整数')
  }
  const requestedActualValuationQty = calculatedLength
    ? Number((Number(input.lengthPerPiece) * Number(input.pieceCount)).toFixed(6))
    : Number(input.valuationQty || 0)
  if (!Number.isFinite(requestedActualValuationQty) || (calculatedLength && requestedActualValuationQty <= 0)) {
    throw new MaterialInDomainError('计算得到的总长度必须是有效正数')
  }
  let effectiveValuationQty = qty
  let conversionSource = 'SAME_UNIT'
  let conversionSampleCount = 0
  if (materialUsesDualUnit && requestedActualValuationQty > 0) {
    effectiveValuationQty = requestedActualValuationQty
    conversionSource = calculatedLength ? 'CALCULATED_LENGTH' : 'DOCUMENT_ACTUAL'
  } else if (materialUsesDualUnit) {
    const history = await loadMaterialInConversionHistory(material.id, scope, tx)
    if (!history.available || !history.rate) {
      throw new MaterialInDomainError(
        `物料 ${material.code} 已启用辅助单位 ${units.valuationUnit}，有效历史实测不足 ${materialInHistoryMinimumSamples} 批，请填写本批实测辅助数量`,
      )
    }
    effectiveValuationQty = Number((qty * history.rate).toFixed(6))
    conversionSource = 'HISTORICAL_ESTIMATE'
    conversionSampleCount = history.sampleCount
  }
  const conversionRate = Number((effectiveValuationQty / qty).toFixed(6))
  const valuationUnit = materialUsesDualUnit ? units.valuationUnit : stockUnit
  const requestedPriceBasis = materialUsesDualUnit && input.priceBasis === 'VALUATION' ? 'VALUATION' : 'STOCK'
  const requestedPriceUnit = normalizeMaterialInPriceUnit(
    requestedPriceBasis === 'VALUATION' ? valuationUnit : stockUnit,
    requestedPriceBasis === 'VALUATION' ? material.referenceMeasure || material.primaryMeasure : material.primaryMeasure,
  )
  const pricing = resolveMaterialInPricing({
    priceUnit: requestedPriceUnit,
    priceBasis: requestedPriceBasis,
    priceQuantity: requestedPriceBasis === 'VALUATION' ? effectiveValuationQty : qty,
    unitPrice: input.unitPrice,
    totalAmount: input.totalAmount,
  })
  const valuationUnitCost = effectiveValuationQty > 0 ? Number((pricing.totalAmount / effectiveValuationQty).toFixed(6)) : 0
  const stockUnitCost = qty > 0 ? Number((pricing.totalAmount / qty).toFixed(6)) : 0

  return {
    material,
    location,
    data: {
      materialId: input.materialId,
      locationId: location.id,
      qty,
      unit: stockUnit,
      pieceCount: calculatedLength ? input.pieceCount : null,
      stockQtyMode: 'TOTAL',
      stockQtyInput: qty,
      totalLength: calculatedLength ? effectiveValuationQty : null,
      totalWeight: null,
      valuationQty: effectiveValuationQty,
      valuationUnit,
      conversionRate,
      conversionSource,
      conversionSampleCount,
      unitVersionUsed: material.unitVersion,
      unitPrice: pricing.unitPrice,
      priceBasis: pricing.priceBasis,
      priceUnit: pricing.priceUnit,
      valuationUnitCost,
      stockUnitCost,
      totalAmount: pricing.totalAmount,
      batchNo: input.batchNo?.trim() || null,
    },
  }
}

function lineInboundNo(receiptNo: string, lineNo: number) {
  return `${receiptNo}-${String(lineNo).padStart(3, '0')}`
}

async function createMaterialInLine(
  tx: Prisma.TransactionClient,
  receipt: { id: string; inboundNo: string; stagingLocationId: string },
  common: { supplierId: string; voucherNo?: string; receivedBy?: string; note?: string },
  input: MaterialInItemInput,
  lineNo: number,
  scope: EffectiveDataScope,
) {
  const { data } = await buildMaterialInLineData(tx, input, receipt.stagingLocationId, scope)
  return tx.materialIn.create({
    data: {
      receiptId: receipt.id,
      lineNo,
      inboundNo: lineInboundNo(receipt.inboundNo, lineNo),
      voucherNo: common.voucherNo?.trim() || null,
      supplierId: common.supplierId,
      ...data,
      receivedBy: common.receivedBy?.trim() || null,
      note: common.note?.trim() || null,
      status: 'PENDING',
    },
    include: materialInInclude(),
  })
}

export async function createMaterialIns(input: CreateMaterialInInput, now = new Date(), scope: EffectiveDataScope = unrestrictedDataScope) {
  return runMaterialInDomainOperation(() => prisma.$transaction(async (tx) => {
    const { supplierId, voucherNo, receivedBy, note } = input
    const requestedItems = 'items' in input ? input.items : [input]
    const requestedStagingLocationId = input.stagingLocationId || requestedItems[0]?.locationId
    assertInventoryLocationDataScope(scope, [requestedStagingLocationId])
    const [supplier, stagingLocation, latest] = await Promise.all([
      tx.supplier.findFirst({ where: { id: supplierId, deletedAt: null } }),
      resolveInventoryLocation(tx, requestedStagingLocationId),
      tx.materialReceipt.findFirst({
        where: { inboundNo: { startsWith: materialInNumberPrefix(now) } },
        orderBy: { inboundNo: 'desc' }, select: { inboundNo: true },
      }),
    ])
    if (!supplier) throw new MaterialInDomainError('供应商不存在或已归档', 404)
    const inboundNo = nextMaterialInNumber(now, latest?.inboundNo)
    const receipt = await tx.materialReceipt.create({
      data: {
        inboundNo,
        voucherNo: voucherNo?.trim() || null,
        supplierId,
        stagingLocationId: stagingLocation.id,
        status: 'PENDING',
        inboundDate: now,
        receivedBy: receivedBy?.trim() || null,
        note: note?.trim() || null,
      },
    })
    const lines = []
    for (let index = 0; index < requestedItems.length; index += 1) {
      lines.push(await createMaterialInLine(
        tx,
        receipt,
        { supplierId, voucherNo, receivedBy, note },
        requestedItems[index],
        index + 1,
        scope,
      ))
    }
    const saved = await tx.materialReceipt.findUniqueOrThrow({ where: { id: receipt.id }, include: materialReceiptInclude() })
    return { first: toMaterialInRecord(saved), items: lines }
  }))
}

export async function archiveMaterialIn(id: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  return runMaterialInDomainOperation(() => prisma.$transaction(async (tx) => {
    const current = await tx.materialReceipt.findUnique({ where: { id }, include: materialReceiptInclude() })
    if (!current || current.deletedAt) throw new MaterialInDomainError('来料单不存在或已归档', 404)
    assertInventoryLocationDataScope(scope, [current.stagingLocationId])
    const deletedAt = new Date()
    await tx.materialIn.updateMany({ where: { receiptId: id }, data: { deletedAt } })
    const updated = await tx.materialReceipt.update({ where: { id }, data: { deletedAt }, include: materialReceiptInclude() })
    return { current: toMaterialInRecord(current), updated: toMaterialInRecord(updated) }
  }))
}

export { MaterialInDomainError } from '../domain/material-in-errors'
