import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createAuditLog, type AuditContext } from '@/lib/audit-core'
import { syncProductForMaterial } from '@/lib/material-product'
import { getUnitCatalog } from '@/lib/unit-catalog'
import type { MaterialInput } from '../contracts/material-schema'
import type { MaterialImportMode, MaterialImportPreview, MaterialImportSummary, MaterialImportUpload } from '../contracts/material-import'
import { materialImportFields } from '../domain/material-import-fields'
import { collectMappedImportValues, parseMappedMaterialImportRows as parseMaterialImportRows, prepareMaterialImportSheet, type ParsedMappedMaterialRow, type PreparedMaterialImport } from '../domain/material-mapped-import'
import { materialExtensionData } from './material-attributes'
import { MaterialImportError, readMaterialImportFile, type MaterialImportSheet } from './material-import-file'
export { MaterialImportError } from './material-import-file'

type ImportClient = Prisma.TransactionClient
const coreFields = ['code','name','spec','note','category','customerId','primaryMeasure','stockUnit','referenceMeasure','valuationUnit','conversionRate','conversionNote','costingMethod','defaultSalePrice','salesCurrency'] as const
function corePatch(input: Partial<MaterialInput>) {
  const data: Prisma.MaterialUncheckedUpdateInput = {}
  for (const field of coreFields) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue
    const value = input[field]
    if (value !== undefined) Object.assign(data, { [field]: ['note','spec','conversionNote','customerId'].includes(field) ? value || null : value })
    else if (field === 'referenceMeasure') data.referenceMeasure = null
  }
  if (input.unit !== undefined) data.unit = input.unit
  if (input.stockUnit !== undefined || input.valuationUnit !== undefined || input.conversionRate !== undefined) {
    data.unitMode = input.stockUnit === input.valuationUnit && input.conversionRate === 1 ? 'SINGLE' : 'DUAL'
  }
  return data
}
function unitsDiffer(existing: { primaryMeasure: string; referenceMeasure: string | null; stockUnit: string; valuationUnit: string; conversionRate: number }, input: MaterialInput) {
  return existing.primaryMeasure !== input.primaryMeasure || existing.referenceMeasure !== (input.referenceMeasure || null)
    || existing.stockUnit !== input.stockUnit || existing.valuationUnit !== input.valuationUnit || existing.conversionRate !== input.conversionRate
}
async function planMaterialImport(client: ImportClient, sheet: PreparedMaterialImport, file: MaterialImportSheet, mode: MaterialImportMode) {
  const codes = collectMappedImportValues(sheet, 'code')
  const customerNames = collectMappedImportValues(sheet, 'customerName')
  const customerCodes = collectMappedImportValues(sheet, 'customerCode')
  const [existing, customers, unitCatalog] = await Promise.all([
    client.material.findMany({ where: { code: { in: codes } }, include: { stock: true, modelUsages: true, _count: { select: { bomItems: true, modelUsages: true } } } }),
    customerNames.length || customerCodes.length ? client.customer.findMany({ where: { deletedAt: null, OR: [{ name: { in: customerNames } }, { code: { in: customerCodes } }] }, select: { id: true, code: true, name: true } }) : [],
    getUnitCatalog(client),
  ])
  const existingByCode = new Map(existing.map((record) => [record.code, record]))
  const rows = parseMaterialImportRows({ sheet, mode, existingByCode, customers, unitCatalog, invalidCells: file.invalidCells })
  for (const row of rows) {
    const before = existingByCode.get(row.preview.code)
    if (!before || !row.input || row.preview.action !== 'update' || !unitsDiffer(before, row.input)) continue
    row.preview.warnings.push(`计量设置将变更：${before.primaryMeasure}/${before.stockUnit}/${before.valuationUnit}/${before.conversionRate} → ${row.input.primaryMeasure}/${row.input.stockUnit}/${row.input.valuationUnit}/${row.input.conversionRate}`)
    const [movementCount, outputBomCount] = await Promise.all([
      client.stockLog.count({ where: { stock: { materialId: before.id } } }),
      client.bOM.count({ where: { OR: [{ materialId: before.id }, { outputs: { some: { materialId: before.id } } }, { product: { materialId: before.id } }] } }),
    ])
    const hasBalance = before.stock && Object.entries(before.stock).some(([key,value]) => !['id','materialId','createdAt','updatedAt','version'].includes(key) && typeof value === 'number' && Math.abs(value) > 0.000001)
    if (hasBalance || movementCount || before._count.bomItems || outputBomCount || before._count.modelUsages && before.stockUnit !== row.input.stockUnit) {
      row.preview.errors.push('已有库存、流水、BOM 或适用机型用量引用，不能通过导入修改计量设置；请使用相应业务流程处理')
      row.preview.action = 'error'
    }
  }
  return rows
}
function makePreview(sheet: PreparedMaterialImport, file: MaterialImportSheet, rows: ParsedMappedMaterialRow[]): MaterialImportPreview {
  const used = new Set(Object.values(sheet.mapping).filter((value): value is number => value !== null))
  const columns = sheet.headers.map((name,index) => ({ index, name, samples: sheet.rows.map((row) => row.cells[index]).filter((v) => v !== null && v !== undefined && String(v).trim()).slice(0,3) }))
  const summary = { total: rows.length, new: 0, update: 0, skip: 0, error: 0, warnings: 0 }
  for (const row of rows) { summary[row.preview.action] += 1; summary.warnings += row.preview.warnings.length }
  const sampleRows = [...rows.filter((row) => row.preview.errors.length), ...rows.filter((row) => !row.preview.errors.length && row.preview.warnings.length), ...rows.filter((row) => !row.preview.errors.length && !row.preview.warnings.length)].slice(0,100)
  return {
    worksheets: file.worksheets, worksheet: file.worksheet, headerRow: sheet.headerRow, columns,
    fields: materialImportFields, mapping: sheet.mapping,
    ignoredColumns: columns.filter((column) => !used.has(column.index)), warnings: sheet.warnings,
    rows: sampleRows.map((row) => row.preview), summary, canCommit: summary.total > 0 && summary.error === 0,
  }
}
async function prepareUpload(upload: MaterialImportUpload) {
  const file = await readMaterialImportFile(upload)
  try { return { file, sheet: prepareMaterialImportSheet(file.rows, upload.options) } }
  catch (error) { throw new MaterialImportError(error instanceof Error ? error.message : '列映射无效') }
}
export async function previewMaterialImport(upload: MaterialImportUpload): Promise<MaterialImportPreview> {
  const { file, sheet } = await prepareUpload(upload)
  const rows = await planMaterialImport(prisma, sheet, file, upload.options.mode || 'skip')
  return makePreview(sheet, file, rows)
}
/** Both CSV compatibility calls and file commits rerun validation inside the write transaction. */
export async function importMaterialsCsv(input: string | MaterialImportUpload, mode: MaterialImportMode = 'skip', auditContext: AuditContext = {}): Promise<MaterialImportSummary> {
  const upload: MaterialImportUpload = typeof input === 'string' ? { name: 'materials.csv', bytes: new TextEncoder().encode(input), options: { mode } } : input
  const { file, sheet } = await prepareUpload(upload)
  const importMode = upload.options.mode || mode
  return prisma.$transaction(async (tx) => {
    const rows = await planMaterialImport(tx, sheet, file, importMode)
    const preview = makePreview(sheet, file, rows)
    if (!preview.canCommit) throw new MaterialImportError('导入校验失败', rows.flatMap((row) => row.preview.errors.map((message) => `第 ${row.preview.rowNumber} 行：${message}`)).slice(0,200))
    const summary: MaterialImportSummary = { total: rows.length, created: 0, updated: 0, skipped: 0, customersCreated: 0 }
    const changes: Array<{ code: string; action: string; fields: string[] }> = []
    for (const row of rows) {
      if (row.preview.action === 'skip') { summary.skipped += 1; continue }
      if (!row.input) throw new MaterialImportError('物料资料校验结果缺失')
      if (row.existing) {
        const data = { ...corePatch(row.patch), ...materialExtensionData(row.patch, 'update') }
        const unitsChanged = unitsDiffer(row.existing, row.input)
        if (unitsChanged) data.unitVersion = { increment: 1 }
        await syncProductForMaterial(tx, row.existing, { ...row.existing, ...row.input })
        await tx.material.update({ where: { id: row.existing.id }, data })
        summary.updated += 1
        changes.push({ code: row.preview.code, action: 'update', fields: Object.keys(row.patch) })
      } else {
        const value = row.input
        const data: Prisma.MaterialUncheckedCreateInput = {
          code: value.code, name: value.name, unit: value.unit, spec: value.spec || null, note: value.note || null,
          category: value.category || 'RAW', customerId: value.customerId || null, primaryMeasure: value.primaryMeasure || 'QUANTITY',
          stockUnit: value.stockUnit || value.unit, referenceMeasure: value.referenceMeasure || null,
          valuationUnit: value.valuationUnit || value.unit, conversionRate: value.conversionRate || 1,
          conversionNote: value.conversionNote || null,
          unitMode: value.stockUnit === value.valuationUnit && value.conversionRate === 1 ? 'SINGLE' : 'DUAL',
          costingMethod: value.costingMethod || 'WEIGHTED_AVERAGE', defaultSalePrice: value.defaultSalePrice ?? null, salesCurrency: value.salesCurrency || 'CNY',
          ...materialExtensionData(value, 'create'),
        }
        const material = await tx.material.create({ data })
        await tx.stock.create({ data: { materialId: material.id } })
        summary.created += 1
        changes.push({ code: row.preview.code, action: 'new', fields: Object.keys(row.patch) })
      }
    }
    await createAuditLog(tx, auditContext, {
      action: importMode === 'update' ? 'IMPORT_UPSERT' : 'IMPORT_CREATE', entityType: 'MATERIAL', entityLabel: '物料批量导入',
      afterData: { ...summary, worksheet: file.worksheet, headerRow: sheet.headerRow, mapping: sheet.mapping, defaults: sheet.defaults, changes },
      note: `文件：${upload.name}；仅物料主数据，未导入库存余额和初始成本`,
    })
    return summary
  }, { maxWait: 10000, timeout: 180000 })
}
