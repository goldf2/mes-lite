import { parseMaterialListQuery } from '../contracts/material-schema'
import { buildMaterialWhere } from './material-query-service'
import { materialExtensionScalarFields } from '../contracts/material-extension'
import { materialImportFieldByKey } from '../domain/material-import-fields'
import { materialAttributeInclude } from './material-attributes'
import { Prisma } from '@prisma/client'
import { toCsv } from '@/lib/csv'
import { sortByNaturalText } from '@/lib/natural-sort'
import { prisma } from '@/lib/prisma'
import { getSystemSettings } from '@/lib/system-settings'

const categoryLabels: Record<string, string> = { RAW: '原材料', FINISHED: '成品', AUXILIARY: '辅材', SCRAP: '废料', DEFECTIVE: '废品', PACKAGING: '包装物', OTHER: '其他' }
const costingLabels: Record<string, string> = { WEIGHTED_AVERAGE: '移动加权平均', FIFO: '先入先出 FIFO' }
const measureLabels: Record<string, string> = { LENGTH: '长度', WEIGHT: '重量', QUANTITY: '数量', OTHER: '其他' }
const sortFields = new Set(['createdAt', 'code', 'name', 'category', 'customer', 'spec', 'note', 'stockUnit', 'valuationUnit', 'costingMethod', 'stock', 'valuationStock', 'materialKind', 'drawingNo', 'defaultSourceMode'])

export interface MaterialExportQuery {
  keyword?: string | null
  category?: string | null
  categories?: string | null
  customerId?: string | null
  bomStatus?: string | null
  sortBy?: string | null
  sortDir?: string | null
  advanced?: string | null
}

export class MaterialExportError extends Error {}

export async function exportMaterialsCsv(query: MaterialExportQuery) {
  const sortBy = sortFields.has(query.sortBy || '') ? query.sortBy! : 'createdAt'
  const sortDir = query.sortDir === 'asc' ? 'asc' : 'desc'
  const naturalCodeSortEnabled = sortBy === 'code' && (await getSystemSettings()).naturalMaterialCodeSortEnabled
  const orderBy: Prisma.MaterialOrderByWithRelationInput = sortBy === 'customer'
    ? { customer: { name: sortDir } }
    : sortBy === 'stock' ? { stock: { qty: sortDir } }
      : sortBy === 'valuationStock' ? { stock: { valuationQty: sortDir } }
        : { [sortBy]: sortDir }
  const params = new URLSearchParams()
  for (const [key,value] of Object.entries(query)) if (value) params.set(key,value)
  const parsed = parseMaterialListQuery(params)
  if (!parsed.data) throw new MaterialExportError(parsed.error || '导出筛选无效')
  const where = buildMaterialWhere(parsed.data)
  const queried = await prisma.material.findMany({
    where,
    include: { ...materialAttributeInclude, customer: { select: { name: true } }, stock: { select: { qty: true, valuationQty: true, valuationComplete: true, totalCost: true, valuationUnitCost: true, stockUnitCost: true } } },
    orderBy,
  })
  const materials = naturalCodeSortEnabled ? sortByNaturalText(queried, (item) => item.code, sortDir) : queried
  const rows: unknown[][] = [[
    '物料编码', '物料名称', '规格', '备注', '分类', '分类名称', '归属客户', '主计量方式', '库存单位',
    '参考计量方式', '参考/计价单位', '默认参考换算', '成本方法', '成本方法名称', '默认销售价', '销售币种',
    '启用双单位', ...materialExtensionScalarFields.map((key) => materialImportFieldByKey.get(key)!.label), '用途', '适用机型记录(JSON)',
    '库存数量', '核算库存', '库存金额', '每核算单位成本', '每库存单位成本', '换算说明', '创建时间',
  ]]
  for (const material of materials) rows.push([
    material.code, material.name, material.spec || '', material.note || '', material.category,
    categoryLabels[material.category] || material.category, material.customer?.name || '',
    measureLabels[material.primaryMeasure] || material.primaryMeasure, material.stockUnit || material.unit,
    material.referenceMeasure ? measureLabels[material.referenceMeasure] || material.referenceMeasure : '',
    material.valuationUnit || material.unit, material.conversionRate || 1, material.costingMethod,
    costingLabels[material.costingMethod] || material.costingMethod, material.defaultSalePrice ?? '', material.salesCurrency || 'CNY',
    Boolean(material.referenceMeasure), ...materialExtensionScalarFields.map((key) => material[key] ?? ''),
    material.purposes.map((item) => item.purposeCode).join(';'),
    JSON.stringify(material.modelUsages.map(({ modelCode, assemblyName, quantityPerMachine }) => ({ modelCode, assemblyName, quantityPerMachine }))),
    material.stock?.qty || 0, material.stock?.valuationComplete === false ? '未知' : material.stock?.valuationQty || 0, material.stock?.totalCost || 0,
    material.stock?.valuationComplete === false ? '未知' : material.stock?.valuationUnitCost || 0, material.stock?.stockUnitCost || 0, material.conversionNote || '', material.createdAt.toISOString(),
  ])
  return toCsv(rows)
}
