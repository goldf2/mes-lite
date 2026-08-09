import { parseCsv } from '@/lib/csv'
import { normalizeConversionRate } from '@/lib/units'
import { findCatalogUnit, type UnitCatalogEntry } from '@/lib/unit-catalog'
import type { ImportCustomer, ImportMaterial } from '../contracts/material-import'

const allowedCategories = new Set(['RAW', 'FINISHED', 'AUXILIARY', 'SCRAP', 'DEFECTIVE', 'PACKAGING', 'OTHER'])
const allowedCostingMethods = new Set(['WEIGHTED_AVERAGE', 'FIFO'])
const allowedPrimaryMeasures = new Set(['LENGTH', 'WEIGHT', 'QUANTITY', 'OTHER'])
const categoryAliases: Record<string, string> = {
  RAW: 'RAW', 原材料: 'RAW', 原料: 'RAW', FINISHED: 'FINISHED', 成品: 'FINISHED',
  AUXILIARY: 'AUXILIARY', 辅材: 'AUXILIARY', SCRAP: 'SCRAP', 废料: 'SCRAP',
  DEFECTIVE: 'DEFECTIVE', 废品: 'DEFECTIVE', PACKAGING: 'PACKAGING', 包装物: 'PACKAGING',
  OTHER: 'OTHER', 其他: 'OTHER',
}
const costingAliases: Record<string, string> = {
  WEIGHTED_AVERAGE: 'WEIGHTED_AVERAGE', 移动加权平均: 'WEIGHTED_AVERAGE',
  加权平均: 'WEIGHTED_AVERAGE', 平均成本: 'WEIGHTED_AVERAGE', FIFO: 'FIFO', 先入先出: 'FIFO',
}
const primaryMeasureAliases: Record<string, string> = {
  LENGTH: 'LENGTH', 长度: 'LENGTH', WEIGHT: 'WEIGHT', 重量: 'WEIGHT',
  QUANTITY: 'QUANTITY', 数量: 'QUANTITY', 计数: 'QUANTITY', OTHER: 'OTHER', 其他: 'OTHER',
}

function normalizeHeader(value: string) {
  return value.trim().replace(/^\uFEFF/, '')
}

function cell(row: string[], headerMap: Map<string, number>, names: string[]) {
  for (const name of names) {
    const index = headerMap.get(name)
    if (index !== undefined) return (row[index] || '').trim()
  }
  return ''
}

function normalizeYes(value: string) {
  return ['是', 'yes', 'y', 'true', '1', '启用'].includes(value.trim().toLowerCase())
}

function normalizeAlias(value: string, fallback: string, aliases: Record<string, string>) {
  const next = value.trim() || fallback
  return aliases[next] || next.toUpperCase()
}

export function readMaterialImportSheet(text: string) {
  const rows = parseCsv(text).filter((row) => row.some((item) => item.trim()))
  if (rows.length < 2) return { error: 'CSV 至少需要表头和一行物料数据' } as const
  const headers = rows[0].map(normalizeHeader)
  const headerMap = new Map(headers.map((header, index) => [header, index]))
  const missingHeaders = ['物料编码', '物料名称', '库存单位'].filter((header) => !headerMap.has(header))
  if (missingHeaders.length > 0) return { error: `缺少表头：${missingHeaders.join('、')}` } as const
  return {
    rows: rows.slice(1),
    headerMap,
    customerNames: Array.from(new Set(rows.slice(1).map((row) => cell(row, headerMap, ['归属客户', '客户', '客户名称', '归属客户名称'])).filter(Boolean))),
    customerCodes: Array.from(new Set(rows.slice(1).map((row) => cell(row, headerMap, ['客户编码', '归属客户编码'])).filter(Boolean))),
  }
}

export function parseMaterialImportRows(input: {
  rows: string[][]
  headerMap: Map<string, number>
  customers: ImportCustomer[]
  unitCatalog: UnitCatalogEntry[]
}) {
  const { rows, headerMap, customers, unitCatalog } = input
  const customerByCode = new Map(customers.map((customer) => [customer.code, customer.id]))
  const customersByName = new Map<string, ImportCustomer[]>()
  for (const customer of customers) customersByName.set(customer.name, [...(customersByName.get(customer.name) || []), customer])
  const errors: string[] = []
  const materials: ImportMaterial[] = []
  const seenCodes = new Set<string>()

  rows.forEach((row, index) => {
    const rowNumber = index + 2
    const code = cell(row, headerMap, ['物料编码', '编码'])
    const name = cell(row, headerMap, ['物料名称', '名称'])
    const spec = cell(row, headerMap, ['规格'])
    const note = cell(row, headerMap, ['备注', '备注栏', '说明'])
    const category = normalizeAlias(cell(row, headerMap, ['分类', '物料分类']), 'RAW', categoryAliases)
    const customerName = cell(row, headerMap, ['归属客户', '客户', '客户名称', '归属客户名称'])
    const customerCode = cell(row, headerMap, ['客户编码', '归属客户编码'])
    const primaryMeasure = normalizeAlias(cell(row, headerMap, ['主计量方式', '主计量类型']), 'QUANTITY', primaryMeasureAliases)
    const stockUnit = cell(row, headerMap, ['库存单位', '领料单位', '单位'])
    const useDualUnit = normalizeYes(cell(row, headerMap, ['启用双单位', '双单位']))
    const referenceMeasure = useDualUnit
      ? normalizeAlias(cell(row, headerMap, ['参考计量方式', '核算计量方式']), 'OTHER', primaryMeasureAliases)
      : null
    const rawValuationUnit = cell(row, headerMap, ['核算单位', '计价单位'])
    const rawConversionRate = cell(row, headerMap, ['换算系数', '换算率'])
    const conversionNote = cell(row, headerMap, ['换算说明'])
    const costingMethod = normalizeAlias(cell(row, headerMap, ['成本方法', '成本核算方法']), 'WEIGHTED_AVERAGE', costingAliases)
    const rawDefaultSalePrice = cell(row, headerMap, ['默认销售价', '销售价'])
    const defaultSalePrice = rawDefaultSalePrice === '' ? null : Number(rawDefaultSalePrice)
    const salesCurrency = cell(row, headerMap, ['销售币种', '币种']) || 'CNY'

    if (!code) errors.push(`第 ${rowNumber} 行：物料编码不能为空`)
    if (!name) errors.push(`第 ${rowNumber} 行：物料名称不能为空`)
    if (!stockUnit) errors.push(`第 ${rowNumber} 行：库存单位不能为空`)
    if (code && seenCodes.has(code)) errors.push(`第 ${rowNumber} 行：物料编码在文件中重复`)
    if (code) seenCodes.add(code)
    if (!allowedCategories.has(category)) errors.push(`第 ${rowNumber} 行：分类无效，应为 RAW/FINISHED/AUXILIARY/SCRAP/DEFECTIVE/PACKAGING/OTHER`)
    if (!allowedPrimaryMeasures.has(primaryMeasure)) errors.push(`第 ${rowNumber} 行：主计量方式无效，应为 LENGTH/WEIGHT/QUANTITY/OTHER`)
    if (referenceMeasure && !allowedPrimaryMeasures.has(referenceMeasure)) errors.push(`第 ${rowNumber} 行：参考计量方式无效，应为 LENGTH/WEIGHT/QUANTITY/OTHER`)
    if (!allowedCostingMethods.has(costingMethod)) errors.push(`第 ${rowNumber} 行：成本方法无效，应为 WEIGHTED_AVERAGE 或 FIFO`)
    if (defaultSalePrice !== null && (!Number.isFinite(defaultSalePrice) || defaultSalePrice < 0)) errors.push(`第 ${rowNumber} 行：默认销售价必须大于或等于 0`)
    if (salesCurrency !== 'CNY') errors.push(`第 ${rowNumber} 行：当前仅支持 CNY 销售币种`)
    if (allowedPrimaryMeasures.has(primaryMeasure) && stockUnit && !findCatalogUnit(unitCatalog, primaryMeasure, stockUnit)) {
      errors.push(`第 ${rowNumber} 行：库存单位 ${stockUnit} 未在${primaryMeasure}计量方式下配置`)
    }

    const valuationUnit = useDualUnit ? rawValuationUnit : stockUnit
    if (useDualUnit && !valuationUnit) errors.push(`第 ${rowNumber} 行：启用双单位时核算单位不能为空`)
    if (useDualUnit && referenceMeasure && valuationUnit && !findCatalogUnit(unitCatalog, referenceMeasure, valuationUnit)) {
      errors.push(`第 ${rowNumber} 行：核算单位 ${valuationUnit} 未在${referenceMeasure}计量方式下配置`)
    }
    const conversionRate = useDualUnit ? Number(rawConversionRate) : 1
    if (useDualUnit && (!Number.isFinite(conversionRate) || conversionRate <= 0)) errors.push(`第 ${rowNumber} 行：启用双单位时换算系数必须大于 0`)

    let customerId: string | null = null
    if (customerName) {
      const matched = customersByName.get(customerName) || []
      if (matched.length === 1) customerId = matched[0].id
      else if (matched.length > 1) {
        const matchedByCode = customerCode ? matched.find((customer) => customer.code === customerCode) : null
        if (matchedByCode) customerId = matchedByCode.id
        else errors.push(`第 ${rowNumber} 行：归属客户 ${customerName} 存在重名，请在客户基础资料中调整名称或使用旧版客户编码列区分`)
      } else if (customerCode && customerByCode.has(customerCode)) customerId = customerByCode.get(customerCode) || null
    } else if (customerCode) {
      if (customerByCode.has(customerCode)) customerId = customerByCode.get(customerCode) || null
      else errors.push(`第 ${rowNumber} 行：客户编码 ${customerCode} 不存在或已归档；新模板请使用归属客户名称，系统会自动创建新客户`)
    }
    materials.push({
      rowNumber, code, name, spec, note, category, customerName, customerId,
      primaryMeasure, referenceMeasure, stockUnit, valuationUnit: valuationUnit || stockUnit,
      conversionRate: normalizeConversionRate(conversionRate), conversionNote,
      costingMethod, defaultSalePrice, salesCurrency,
    })
  })
  return { materials, errors }
}
