import { createInternalCode } from '@/lib/internal-codes'
import { prisma } from '@/lib/prisma'
import { getUnitCatalog } from '@/lib/unit-catalog'
import type { MaterialImportMode } from '../contracts/material-import'
import { parseMaterialImportRows, readMaterialImportSheet } from '../domain/material-import-parser'

export class MaterialImportError extends Error {
  constructor(message: string, public readonly details?: string[]) {
    super(message)
    this.name = 'MaterialImportError'
  }
}

export async function importMaterialsCsv(text: string, mode: MaterialImportMode) {
  const sheet = readMaterialImportSheet(text)
  if ('error' in sheet) throw new MaterialImportError(sheet.error || 'CSV 格式无效')
  const customerConditions = [
    sheet.customerNames.length > 0 ? { name: { in: sheet.customerNames } } : null,
    sheet.customerCodes.length > 0 ? { code: { in: sheet.customerCodes } } : null,
  ].filter(Boolean) as Array<{ name: { in: string[] } } | { code: { in: string[] } }>
  const [customers, unitCatalog] = await Promise.all([
    customerConditions.length === 0 ? [] : prisma.customer.findMany({
      where: { deletedAt: null, OR: customerConditions },
      select: { id: true, code: true, name: true },
    }),
    getUnitCatalog(),
  ])
  const parsed = parseMaterialImportRows({ ...sheet, customers, unitCatalog })
  if (parsed.errors.length > 0) throw new MaterialImportError('导入校验失败', parsed.errors)

  const codes = parsed.materials.map((item) => item.code)
  const existingMaterials = await prisma.material.findMany({
    where: { code: { in: codes } },
    select: {
      id: true, code: true, deletedAt: true, primaryMeasure: true, referenceMeasure: true,
      stockUnit: true, valuationUnit: true, stock: true, _count: { select: { bomItems: true } },
    },
  })
  const existingByCode = new Map(existingMaterials.map((material) => [material.code, material]))
  const archivedCodes = existingMaterials.filter((material) => material.deletedAt).map((material) => material.code)
  if (archivedCodes.length > 0) throw new MaterialImportError(`以下物料编码已被已归档记录占用：${archivedCodes.join('、')}`)

  if (mode === 'update') {
    const lockedUnitErrors = (await Promise.all(parsed.materials.map(async (item) => {
      const existing = existingByCode.get(item.code)
      if (!existing || (
        existing.primaryMeasure === item.primaryMeasure
        && existing.referenceMeasure === item.referenceMeasure
        && existing.stockUnit === item.stockUnit
        && existing.valuationUnit === item.valuationUnit
      )) return null
      const [movementCount, outputBomCount] = await Promise.all([
        prisma.stockLog.count({ where: { stock: { materialId: existing.id } } }),
        prisma.bOM.count({ where: { product: { sku: { in: [existing.code, `MAT-${existing.code}`] } } } }),
      ])
      const stock = existing.stock as Record<string, unknown> | null
      const hasBalance = stock
        ? [
            'qty', 'valuationQty', 'reservedQty', 'reservedValuationQty',
            'quarantineQty', 'holdQty', 'reworkQty', 'quarantineValuationQty', 'holdValuationQty', 'reworkValuationQty',
            'totalCost', 'quarantineCost', 'holdCost', 'reworkCost',
          ]
            .some((field) => Math.abs(Number(stock[field] || 0)) > 0.000001)
        : false
      return hasBalance || movementCount > 0 || existing._count.bomItems > 0 || outputBomCount > 0
        ? `第 ${item.rowNumber} 行：物料 ${item.code} 已有库存、流水或 BOM，不能通过导入修改单位`
        : null
    }))).filter((error): error is string => Boolean(error))
    if (lockedUnitErrors.length > 0) throw new MaterialImportError('导入校验失败', lockedUnitErrors)
  }

  return prisma.$transaction(async (tx) => {
    let created = 0
    let updated = 0
    let skipped = 0
    let customersCreated = 0
    const createdCustomerByName = new Map<string, string>()
    const missingCustomerNames = Array.from(new Set(parsed.materials
      .filter((item) => {
        if (!item.customerName || item.customerId) return false
        const existing = existingByCode.get(item.code)
        return !existing || mode === 'update'
      })
      .map((item) => item.customerName)))
    for (const customerName of missingCustomerNames) {
      const customer = await tx.customer.create({
        data: { code: createInternalCode('cus'), name: customerName },
        select: { id: true, name: true },
      })
      createdCustomerByName.set(customer.name, customer.id)
      customersCreated += 1
    }

    for (const item of parsed.materials) {
      const existing = existingByCode.get(item.code)
      const data = {
        code: item.code, name: item.name, spec: item.spec, note: item.note || null,
        category: item.category,
        customerId: item.customerId || (item.customerName ? createdCustomerByName.get(item.customerName) || null : null),
        primaryMeasure: item.primaryMeasure, referenceMeasure: item.referenceMeasure,
        unit: item.stockUnit, stockUnit: item.stockUnit, valuationUnit: item.valuationUnit,
        conversionRate: item.conversionRate, conversionNote: item.conversionNote || null,
        unitMode: item.stockUnit === item.valuationUnit && item.conversionRate === 1 ? 'SINGLE' : 'DUAL',
        costingMethod: item.costingMethod, defaultSalePrice: item.defaultSalePrice, salesCurrency: item.salesCurrency,
      }
      if (existing) {
        if (mode !== 'update') {
          skipped += 1
          continue
        }
        await tx.material.update({ where: { id: existing.id }, data })
        await tx.stock.upsert({ where: { materialId: existing.id }, create: { materialId: existing.id }, update: {} })
        updated += 1
      } else {
        const material = await tx.material.create({ data })
        await tx.stock.create({ data: { materialId: material.id } })
        created += 1
      }
    }
    return { total: parsed.materials.length, created, updated, skipped, customersCreated }
  })
}
