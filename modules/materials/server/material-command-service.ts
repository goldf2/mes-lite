import { createAuditLog } from '@/lib/audit'
import { normalizeConversionRate } from '@/lib/units'
import { findCatalogUnit, getUnitCatalog } from '@/lib/unit-catalog'
import { prisma } from '@/lib/prisma'
import { syncProductForMaterial } from '@/lib/material-product'
import type { MaterialInput, MaterialUpdateInput } from '../contracts/material-schema'

type AuditContext = Parameters<typeof createAuditLog>[1]

export class MaterialInputError extends Error {}
export class MaterialConflictError extends Error {}
export class MaterialNotFoundError extends Error {
  constructor() { super('物料不存在') }
}

export class MaterialArchiveError extends Error {
  constructor() { super('物料不存在或已归档') }
}

async function validateConfiguredMaterialUnits(input: {
  primaryMeasure: string
  stockUnit: string
  referenceMeasure?: string | null
  valuationUnit?: string | null
  legacy?: { primaryMeasure: string; stockUnit: string; referenceMeasure?: string | null; valuationUnit?: string | null }
}) {
  const catalog = await getUnitCatalog()
  const stockConfigured = findCatalogUnit(catalog, input.primaryMeasure, input.stockUnit)
  const stockUnchanged = input.legacy?.primaryMeasure === input.primaryMeasure && input.legacy.stockUnit === input.stockUnit
  if (!stockConfigured && !stockUnchanged) throw new MaterialInputError(`主库存单位 ${input.stockUnit} 未在${input.primaryMeasure}计量方式下配置`)
  if (input.referenceMeasure) {
    const valuationConfigured = findCatalogUnit(catalog, input.referenceMeasure, input.valuationUnit)
    const valuationUnchanged = input.legacy?.referenceMeasure === input.referenceMeasure && input.legacy.valuationUnit === input.valuationUnit
    if (!valuationConfigured && !valuationUnchanged) throw new MaterialInputError(`参考/计价单位 ${input.valuationUnit || '空'} 未在${input.referenceMeasure}计量方式下配置`)
  }
}

function materialData(input: MaterialInput, current?: { primaryMeasure: string }) {
  const stockUnit = input.stockUnit || input.unit
  const valuationUnit = input.valuationUnit || input.unit
  const primaryMeasure = input.primaryMeasure || current?.primaryMeasure || 'QUANTITY'
  const referenceMeasure = input.referenceMeasure || null
  const conversionRate = normalizeConversionRate(input.conversionRate)
  return {
    code: input.code,
    name: input.name,
    spec: input.spec || '',
    note: input.note || null,
    category: input.category || 'RAW',
    customerId: input.customerId || null,
    primaryMeasure,
    referenceMeasure,
    unit: stockUnit,
    stockUnit,
    valuationUnit,
    conversionRate,
    conversionNote: input.conversionNote || null,
    unitMode: stockUnit === valuationUnit && conversionRate === 1 ? 'SINGLE' : 'DUAL',
    costingMethod: input.costingMethod || 'WEIGHTED_AVERAGE',
    defaultSalePrice: input.defaultSalePrice ?? null,
    salesCurrency: input.salesCurrency || 'CNY',
  }
}

async function assertCodeAvailable(code: string, currentId?: string) {
  const existing = await prisma.material.findUnique({ where: { code } })
  if (existing && existing.id !== currentId) {
    throw new MaterialConflictError(existing.deletedAt ? '物料编码已被已归档记录占用' : '物料编码已存在')
  }
}

export async function createMaterial(input: MaterialInput) {
  const data = materialData(input)
  await validateConfiguredMaterialUnits({
    primaryMeasure: data.primaryMeasure,
    stockUnit: data.stockUnit,
    referenceMeasure: data.referenceMeasure,
    valuationUnit: data.valuationUnit,
  })
  await assertCodeAvailable(input.code)
  return prisma.$transaction(async (tx) => {
    const material = await tx.material.create({ data })
    await tx.stock.create({ data: { materialId: material.id } })
    return material
  })
}

export async function updateMaterial(
  input: MaterialUpdateInput,
  getAuditContext: () => Promise<AuditContext>,
) {
  await assertCodeAvailable(input.code, input.id)
  const before = await prisma.material.findUnique({ where: { id: input.id }, include: { stock: true, _count: { select: { bomItems: true } } } })
  if (!before) throw new MaterialNotFoundError()
  const data = materialData(input, before)
  await validateConfiguredMaterialUnits({
    primaryMeasure: data.primaryMeasure,
    stockUnit: data.stockUnit,
    referenceMeasure: data.referenceMeasure,
    valuationUnit: data.valuationUnit,
    legacy: before,
  })
  const unitsChanged = before.stockUnit !== data.stockUnit
    || before.valuationUnit !== data.valuationUnit
    || before.primaryMeasure !== data.primaryMeasure
    || before.referenceMeasure !== data.referenceMeasure
  const auditContext = unitsChanged ? await getAuditContext() : null
  const material = await prisma.$transaction(async (tx) => {
    await syncProductForMaterial(tx, before, { ...before, ...data })
    const updated = await tx.material.update({
      where: { id: input.id },
      data: { ...data, unitVersion: unitsChanged ? { increment: 1 } : undefined },
    })
    await tx.stock.upsert({ where: { materialId: updated.id }, update: {}, create: { materialId: updated.id } })
    if (auditContext) {
      await createAuditLog(tx, auditContext, {
        action: 'UNIT_CHANGE', entityType: 'MATERIAL', entityId: updated.id, entityLabel: updated.code,
        beforeData: before,
        afterData: {
          ...updated,
          unitChange: {
            numericValuesConverted: false,
            relatedRecordsUpdated: false,
            from: { primaryMeasure: before.primaryMeasure, stockUnit: before.stockUnit, referenceMeasure: before.referenceMeasure, valuationUnit: before.valuationUnit },
            to: { primaryMeasure: data.primaryMeasure, stockUnit: data.stockUnit, referenceMeasure: data.referenceMeasure, valuationUnit: data.valuationUnit },
          },
        },
        note: '修改物料计量设置；未换算任何数值，也未改写历史单据、库存流水、成本层或既有 BOM',
      })
    }
    return updated
  })
  return { before, material, unitsChanged }
}

export async function archiveMaterialRecord(id: string) {
  const before = await prisma.material.findUnique({ where: { id } })
  if (!before || before.deletedAt) throw new MaterialArchiveError()
  const material = await prisma.material.update({ where: { id }, data: { deletedAt: new Date() } })
  return { before, material }
}
