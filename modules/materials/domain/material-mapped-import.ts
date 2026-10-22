import { materialInputSchema } from '../contracts/material-schema'
import type { MaterialInput } from '../contracts/material-schema'
import type { ImportCustomer, MaterialImportCell, MaterialImportOptions, MaterialImportRowPreview } from '../contracts/material-import'
import { findCatalogUnit, type UnitCatalogEntry } from '@/lib/unit-catalog'
import { autoMapMaterialColumns, materialImportFieldByKey, materialImportFields } from './material-import-fields'

export type ExistingImportMaterial = {
  id: string; code: string; name: string; deletedAt: Date | null
  unit: string; stockUnit: string; valuationUnit: string; primaryMeasure: string
  referenceMeasure: string | null; conversionRate: number; category: string; customerId: string | null
  modelUsages?: Array<{ modelCode: string; assemblyName: string | null; quantityPerMachine: number | null }>
}
export interface PreparedMaterialImport {
  headerRow: number
  headers: string[]
  mapping: Record<string, number | null>
  rows: Array<{ rowNumber: number; cells: MaterialImportCell[] }>
  warnings: string[]
  defaults: Record<string, MaterialImportCell>
}
const aliases: Record<string, Record<string, string>> = {
  category: { 原材料: 'RAW', 原料: 'RAW', 成品: 'FINISHED', 辅材: 'AUXILIARY', 废料: 'SCRAP', 废品: 'DEFECTIVE', 包装物: 'PACKAGING', 其他: 'OTHER' },
  primaryMeasure: { 长度: 'LENGTH', 重量: 'WEIGHT', 数量: 'QUANTITY', 计数: 'QUANTITY', 其他: 'OTHER' },
  referenceMeasure: { 长度: 'LENGTH', 重量: 'WEIGHT', 数量: 'QUANTITY', 计数: 'QUANTITY', 其他: 'OTHER' },
  costingMethod: { 移动加权平均: 'WEIGHTED_AVERAGE', 加权平均: 'WEIGHTED_AVERAGE', 平均成本: 'WEIGHTED_AVERAGE', 先入先出: 'FIFO', '先入先出 FIFO': 'FIFO' },
  materialKind: { 通用: 'GENERAL', 通用物料: 'GENERAL', 零件: 'PART' },
  defaultSourceMode: { 自制: 'MAKE', 外购: 'BUY', 外协: 'SUBCONTRACT', 委外: 'SUBCONTRACT' },
}
const enumFields = new Set([...Object.keys(aliases), 'salesCurrency'])
const baseEmptyText = new Set(['code', 'name', 'spec', 'note', 'stockUnit', 'valuationUnit', 'conversionNote', 'customerName', 'customerCode', 'modelCode', 'assemblyName'])
const trueValues = new Set(['true', '1', 'yes', 'y', '是', '启用'])
const falseValues = new Set(['false', '0', 'no', 'n', '否', '不启用'])
export function importCellText(value: MaterialImportCell | undefined) { return value === null || value === undefined ? '' : String(value).trim() }
export function prepareMaterialImportSheet(rows: MaterialImportCell[][], options: MaterialImportOptions): PreparedMaterialImport {
  const headerRow = options.headerRow ?? 1
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > 50) throw new Error('表头行须为 1–50 的整数')
  if (!rows[headerRow - 1]) throw new Error('表头行超出工作表范围')
  const headers = rows[headerRow - 1].map(importCellText)
  const { mapping, warnings } = autoMapMaterialColumns(headers)
  for (const [key, index] of Object.entries(options.mapping || {})) {
    if (!materialImportFieldByKey.has(key)) throw new Error(`不支持的映射字段：${key}`)
    if (index !== null && (!Number.isInteger(index) || index < 0 || index >= headers.length)) throw new Error(`字段 ${key} 的源列无效`)
    mapping[key] = index
  }
  const used = new Map<number, string>()
  for (const [key, index] of Object.entries(mapping)) {
    if (index === null) continue
    if (used.has(index)) throw new Error(`源列 ${headers[index] || index + 1} 同时映射到 ${used.get(index)} 和 ${key}，请保持一一对应`)
    used.set(index, key)
  }
  const defaults = options.defaults || {}
  if ((mapping.modelUsagesJson !== null || 'modelUsagesJson' in defaults) && ['modelCode','assemblyName','quantityPerMachine'].some((key) => mapping[key] !== null || key in defaults)) throw new Error('适用机型 JSON 与单机型三列不能同时映射，请选择一种关系导入方式')
  for (const [key,value] of Object.entries(defaults)) {
    if (!materialImportFieldByKey.has(key)) throw new Error(`不支持的默认字段：${key}`)
    if (value !== null && !['string','number','boolean'].includes(typeof value)) throw new Error(`默认字段 ${key} 无效`)
  }
  const dataRows = rows.slice(headerRow).flatMap((cells, index) => cells.some((v) => importCellText(v)) ? [{ rowNumber: headerRow + index + 1, cells }] : [])
  if (dataRows.length > 10000) throw new Error('每次最多导入 10000 行物料')
  if (!dataRows.length) warnings.push('表头之后没有物料数据')
  if (mapping.code === null) warnings.push('请映射物料编码列')
  return { headerRow, headers, mapping, rows: dataRows, warnings, defaults }
}
export function mappedImportValue(sheet: PreparedMaterialImport, cells: MaterialImportCell[], key: string) {
  const index = sheet.mapping[key]
  const value = index === null || index === undefined ? undefined : cells[index] ?? null
  return value === undefined && key in sheet.defaults ? sheet.defaults[key] : value
}
export function collectMappedImportValues(sheet: PreparedMaterialImport, key: string) {
  return Array.from(new Set(sheet.rows.map((row) => importCellText(mappedImportValue(sheet, row.cells, key))).filter(Boolean)))
}
export interface ParsedMappedMaterialRow {
  preview: MaterialImportRowPreview
  input?: MaterialInput
  patch: Partial<MaterialInput>
  existing?: ExistingImportMaterial
}
export function parseMappedMaterialImportRows(input: {
  sheet: PreparedMaterialImport
  mode: 'skip' | 'update'
  existingByCode: Map<string, ExistingImportMaterial>
  customers: ImportCustomer[]
  unitCatalog: UnitCatalogEntry[]
  invalidCells?: Map<string, string>
}): ParsedMappedMaterialRow[] {
  const { sheet, mode, existingByCode, customers, unitCatalog, invalidCells } = input
  const codeCounts = new Map<string, number>()
  for (const row of sheet.rows) {
    const code = importCellText(mappedImportValue(sheet, row.cells, 'code'))
    if (code) codeCounts.set(code, (codeCounts.get(code) || 0) + 1)
  }
  return sheet.rows.map(({ rowNumber, cells }) => {
    const errors: string[] = []
    const warnings: string[] = []
    const code = importCellText(mappedImportValue(sheet, cells, 'code'))
    const existing = existingByCode.get(code)
    const values: Record<string, unknown> = { code }
    const preview: MaterialImportRowPreview = { rowNumber, code, name: existing?.name || '', action: existing ? mode === 'skip' ? 'skip' : 'update' : 'new', errors, warnings, values }
    if (!code) errors.push('物料编码不能为空')
    if (code.length > 200) errors.push('物料编码不能超过 200 字符')
    if ((codeCounts.get(code) || 0) > 1) errors.push('物料编码在文件中重复（所有重复行均须处理）')
    if (existing?.deletedAt) errors.push('物料编码已被已归档记录占用，请先处理归档记录')
    const codeIndex = sheet.mapping.code
    if (codeIndex !== null && invalidCells?.has(`${rowNumber}:${codeIndex}`)) errors.push(`物料编码：${invalidCells.get(`${rowNumber}:${codeIndex}`)}`)
    if (existing && mode === 'skip') {
      if (errors.length) preview.action = 'error'
      warnings.push('已存在编码将跳过；未校验其余字段，也不会写入该行')
      return { preview, patch: {}, existing }
    }
    for (const field of materialImportFields) {
      const raw = mappedImportValue(sheet, cells, field.key)
      if (raw === undefined) continue // unmapped values must not clear existing data
      const index = sheet.mapping[field.key]
      if (index !== null && index !== undefined && invalidCells?.has(`${rowNumber}:${index}`)) errors.push(`${field.label}：${invalidCells.get(`${rowNumber}:${index}`)}`)
      const text = importCellText(raw)
      if (text.length > (field.key === 'name' ? 500 : 10000)) { errors.push(`${field.label} 内容过长`); continue }
      if (enumFields.has(field.key) && !text) {
        if (field.key === 'defaultSourceMode') values[field.key] = null
        continue
      }
      if (field.type === 'number') {
        values[field.key] = text === '' ? null : Number(text)
        if (text !== '' && (!Number.isFinite(values[field.key]) || Number(values[field.key]) < 0)) errors.push(`${field.label} 须为有限且不小于 0 的数值`)
      } else if (field.type === 'boolean') {
        if (!text) values[field.key] = null
        else if (trueValues.has(text.toLowerCase())) values[field.key] = true
        else if (falseValues.has(text.toLowerCase())) values[field.key] = false
        else errors.push(`${field.label} 须为是/否、TRUE/FALSE 或 1/0`)
      } else if (field.type === 'list') {
        if (!text) values[field.key] = undefined
        else if (text.startsWith('[')) { try { values[field.key] = JSON.parse(text) } catch { errors.push(`${field.label} JSON 格式无效`) } }
        else values[field.key] = text.split(/[;；,，|]/).map((v) => v.trim()).filter(Boolean)
      }
      else values[field.key] = aliases[field.key] ? (aliases[field.key][text] || text.toUpperCase()) : (text || (baseEmptyText.has(field.key) ? '' : null))
    }
    if (Array.isArray(values.purposeCodes)) {
      const purposeAliases: Record<string,string> = { 自有设备维护: 'OWN_EQUIPMENT', 自有产品制造: 'OWN_PRODUCT', 对外加工: 'EXTERNAL_PROCESSING', 其他用途: 'OTHER' }
      values.purposeCodes = values.purposeCodes.map((value) => typeof value === 'string' ? purposeAliases[value] || value : value)
    }
    preview.name = typeof values.name === 'string' ? values.name : existing?.name || ''
    if (sheet.mapping.code !== null && typeof cells[sheet.mapping.code] === 'number') warnings.push('编码来自数值单元格；前导零无法自动恢复，请核对')
    if (typeof values.quantityPerMachine === 'number' && values.quantityPerMachine === 0) warnings.push('每台数量为 0，保留原值；请确认适用关系含义')
    if (values.modelCode && values.quantityPerMachine === null) warnings.push('每台数量为空，将保留为空；不会默认改为 1')
    const customerName = String(values.customerName || '')
    const customerCode = String(values.customerCode || '')
    if ('customerName' in values || 'customerCode' in values) {
      const matches = customers.filter((c) => customerCode ? c.code === customerCode && (!customerName || c.name === customerName) : c.name === customerName)
      if (customerName || customerCode) {
        if (matches.length !== 1) errors.push(matches.length ? '归属客户重名，请同时映射客户编码' : '归属客户不存在或已归档，请先在客户资料中维护')
        else values.customerId = matches[0].id
      } else values.customerId = ''
    }
    if (values.modelUsagesJson) {
      try { values.modelUsages = JSON.parse(String(values.modelUsagesJson)); warnings.push('适用机型 JSON 将替换该物料的全部适用关系；[] 将清空关系') }
      catch { errors.push('适用机型 JSON 格式无效') }
    } else if (values.modelCode) {
      const current = (existing?.modelUsages || []).map((usage) => ({ modelCode: usage.modelCode, assemblyName: usage.assemblyName || null, quantityPerMachine: usage.quantityPerMachine }))
      const groupMapped = sheet.mapping.assemblyName !== null || 'assemblyName' in sheet.defaults
      const matched = current.filter((usage) => usage.modelCode === values.modelCode && (!groupMapped || (usage.assemblyName || '') === (values.assemblyName || '')))
      if (matched.length > 1) errors.push('该机型有多个部件分组，请映射部件列以明确需要更新的适用关系')
      else {
        const before = matched[0]
        const usage = { modelCode: String(values.modelCode), assemblyName: groupMapped ? String(values.assemblyName || '') || null : before?.assemblyName || null,
          quantityPerMachine: 'quantityPerMachine' in values ? values.quantityPerMachine : before?.quantityPerMachine ?? null }
        values.modelUsages = before ? current.map((item) => item === before ? usage : item) : [...current, usage]
      }
    }
    else if (values.assemblyName || values.quantityPerMachine !== undefined && values.quantityPerMachine !== null) warnings.push('未提供适用机型，部件/每台数量不会写入适用关系')
    const patchObject = { ...values }
    for (const key of ['customerName','customerCode','modelCode','assemblyName','quantityPerMachine','useDualUnit','modelUsagesJson']) delete patchObject[key]
    if (values.useDualUnit === false) {
      patchObject.referenceMeasure = undefined
      patchObject.valuationUnit = values.stockUnit || existing?.stockUnit
      patchObject.conversionRate = 1
    }
    const current = existing as unknown as Record<string, unknown> | undefined
    const base = current ? Object.fromEntries(['code','name','unit','stockUnit','valuationUnit','primaryMeasure','referenceMeasure','conversionRate','category','customerId','spec','note','conversionNote','costingMethod','defaultSalePrice','salesCurrency'].map((key) => [key,current[key]])) : {
      code, name: '', unit: '', stockUnit: '', category: 'RAW', primaryMeasure: 'QUANTITY', conversionRate: 1,
      costingMethod: 'WEIGHTED_AVERAGE', salesCurrency: 'CNY',
    }
    const merged: Record<string, unknown> = { ...base, ...patchObject }
    for (const field of ['note','spec','conversionNote']) if (merged[field] === null) merged[field] = ''
    if (values.useDualUnit === false) merged.referenceMeasure = undefined
    if (merged.referenceMeasure === null || merged.referenceMeasure === '') merged.referenceMeasure = undefined
    if (values.useDualUnit === true && !merged.referenceMeasure) errors.push('启用双单位时须提供参考计量方式')
    merged.unit = merged.stockUnit
    if (!existing || ('stockUnit' in patchObject && !merged.referenceMeasure)) merged.valuationUnit = patchObject.valuationUnit || merged.stockUnit
    if (merged.customerId === null) merged.customerId = undefined
    const validated = materialInputSchema.safeParse(merged)
    if (!validated.success) errors.push(...validated.error.issues.map((issue) => `${materialImportFieldByKey.get(String(issue.path[0]))?.label || issue.path.join('.')}: ${issue.message}`))
    else {
      const data = validated.data
      const sameStockUnit = existing?.stockUnit === data.stockUnit && existing?.primaryMeasure === data.primaryMeasure
      if (!sameStockUnit && !findCatalogUnit(unitCatalog, data.primaryMeasure || 'QUANTITY', data.stockUnit || data.unit)) errors.push('库存单位未在所选主计量方式下配置')
      const sameReference = existing?.referenceMeasure === data.referenceMeasure && existing?.valuationUnit === data.valuationUnit
      if (data.referenceMeasure && !sameReference && !findCatalogUnit(unitCatalog, data.referenceMeasure, data.valuationUnit)) errors.push('核算单位未在所选参考计量方式下配置')
    }
    const patch: Partial<MaterialInput> = {}
    if (validated.success) {
      for (const key of Object.keys(patchObject)) {
        if (key in validated.data) Object.assign(patch, { [key]: validated.data[key as keyof MaterialInput] })
      }
      if (['stockUnit','primaryMeasure','referenceMeasure','valuationUnit','conversionRate','useDualUnit'].some((key) => key in values)) {
        Object.assign(patch, { unit: validated.data.unit, stockUnit: validated.data.stockUnit, primaryMeasure: validated.data.primaryMeasure,
          referenceMeasure: validated.data.referenceMeasure, valuationUnit: validated.data.valuationUnit, conversionRate: validated.data.conversionRate })
      }
    }
    if (errors.length) preview.action = 'error'
    return { preview, patch, existing, input: validated.success ? validated.data : undefined }
  })
}
