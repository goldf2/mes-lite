import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { parseCsv } from '@/lib/csv'
import { normalizeConversionRate } from '@/lib/units'

const allowedCategories = new Set(['RAW', 'FINISHED', 'AUXILIARY', 'SCRAP', 'DEFECTIVE', 'PACKAGING', 'OTHER'])
const allowedCostingMethods = new Set(['WEIGHTED_AVERAGE', 'FIFO'])
const categoryAliases: Record<string, string> = {
  RAW: 'RAW',
  原材料: 'RAW',
  原料: 'RAW',
  FINISHED: 'FINISHED',
  成品: 'FINISHED',
  AUXILIARY: 'AUXILIARY',
  辅材: 'AUXILIARY',
  SCRAP: 'SCRAP',
  废料: 'SCRAP',
  DEFECTIVE: 'DEFECTIVE',
  废品: 'DEFECTIVE',
  PACKAGING: 'PACKAGING',
  包装物: 'PACKAGING',
  OTHER: 'OTHER',
  其他: 'OTHER',
}
const costingAliases: Record<string, string> = {
  WEIGHTED_AVERAGE: 'WEIGHTED_AVERAGE',
  移动加权平均: 'WEIGHTED_AVERAGE',
  加权平均: 'WEIGHTED_AVERAGE',
  平均成本: 'WEIGHTED_AVERAGE',
  FIFO: 'FIFO',
  先入先出: 'FIFO',
}

type ImportMaterial = {
  rowNumber: number
  code: string
  name: string
  spec: string
  category: string
  customerCode: string
  customerId: string | null
  stockUnit: string
  valuationUnit: string
  conversionRate: number
  conversionNote: string
  costingMethod: string
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
  const next = value.trim().toLowerCase()
  return ['是', 'yes', 'y', 'true', '1', '启用'].includes(next)
}

function normalizeCategory(value: string) {
  const next = value.trim() || 'RAW'
  return categoryAliases[next] || next.toUpperCase()
}

function normalizeCostingMethod(value: string) {
  const next = value.trim() || 'WEIGHTED_AVERAGE'
  return costingAliases[next] || next.toUpperCase()
}

export async function POST(req: NextRequest) {
  try {
    const createDenied = await requireResourcePermission('materials', 'create')
    if (createDenied) return createDenied

    const { searchParams } = new URL(req.url)
    const mode = searchParams.get('mode') === 'update' ? 'update' : 'skip'
    if (mode === 'update') {
      const updateDenied = await requireResourcePermission('materials', 'update')
      if (updateDenied) return updateDenied
    }

    const formData = await req.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '请上传 CSV 文件' }, { status: 400 })
    }
    if (file.size > 1024 * 1024) {
      return NextResponse.json({ error: 'CSV 文件不能超过 1MB' }, { status: 400 })
    }

    const text = await file.text()
    const rows = parseCsv(text).filter((row) => row.some((item) => item.trim()))
    if (rows.length < 2) {
      return NextResponse.json({ error: 'CSV 至少需要表头和一行物料数据' }, { status: 400 })
    }

    const headers = rows[0].map(normalizeHeader)
    const headerMap = new Map(headers.map((header, index) => [header, index]))
    const requiredHeaders = ['物料编码', '物料名称', '库存单位']
    const missingHeaders = requiredHeaders.filter((header) => !headerMap.has(header))
    if (missingHeaders.length > 0) {
      return NextResponse.json({ error: `缺少表头：${missingHeaders.join('、')}` }, { status: 400 })
    }

    const customerCodes = Array.from(new Set(rows.slice(1)
      .map((row) => cell(row, headerMap, ['客户编码', '归属客户编码']))
      .filter(Boolean)))
    const customers = customerCodes.length === 0 ? [] : await prisma.customer.findMany({
      where: { code: { in: customerCodes }, deletedAt: null },
      select: { id: true, code: true },
    })
    const customerByCode = new Map(customers.map((customer) => [customer.code, customer.id]))

    const errors: string[] = []
    const parsed: ImportMaterial[] = []
    const seenCodes = new Set<string>()

    rows.slice(1).forEach((row, index) => {
      const rowNumber = index + 2
      const code = cell(row, headerMap, ['物料编码', '编码'])
      const name = cell(row, headerMap, ['物料名称', '名称'])
      const spec = cell(row, headerMap, ['规格'])
      const category = normalizeCategory(cell(row, headerMap, ['分类', '物料分类']))
      const customerCode = cell(row, headerMap, ['客户编码', '归属客户编码'])
      const stockUnit = cell(row, headerMap, ['库存单位', '领料单位', '单位'])
      const useDualUnit = normalizeYes(cell(row, headerMap, ['启用双单位', '双单位']))
      const rawValuationUnit = cell(row, headerMap, ['核算单位', '计价单位'])
      const rawConversionRate = cell(row, headerMap, ['换算系数', '换算率'])
      const conversionNote = cell(row, headerMap, ['换算说明'])
      const costingMethod = normalizeCostingMethod(cell(row, headerMap, ['成本方法', '成本核算方法']))

      if (!code) errors.push(`第 ${rowNumber} 行：物料编码不能为空`)
      if (!name) errors.push(`第 ${rowNumber} 行：物料名称不能为空`)
      if (!stockUnit) errors.push(`第 ${rowNumber} 行：库存单位不能为空`)
      if (code && seenCodes.has(code)) errors.push(`第 ${rowNumber} 行：物料编码在文件中重复`)
      if (code) seenCodes.add(code)
      if (!allowedCategories.has(category)) errors.push(`第 ${rowNumber} 行：分类无效，应为 RAW/FINISHED/AUXILIARY/SCRAP/DEFECTIVE/PACKAGING/OTHER`)
      if (!allowedCostingMethods.has(costingMethod)) errors.push(`第 ${rowNumber} 行：成本方法无效，应为 WEIGHTED_AVERAGE 或 FIFO`)

      const valuationUnit = useDualUnit ? rawValuationUnit : stockUnit
      if (useDualUnit && !valuationUnit) errors.push(`第 ${rowNumber} 行：启用双单位时核算单位不能为空`)

      const conversionRate = useDualUnit ? Number(rawConversionRate) : 1
      if (useDualUnit && (!Number.isFinite(conversionRate) || conversionRate <= 0)) {
        errors.push(`第 ${rowNumber} 行：启用双单位时换算系数必须大于 0`)
      }

      if (customerCode && !customerByCode.has(customerCode)) {
        errors.push(`第 ${rowNumber} 行：客户编码 ${customerCode} 不存在或已归档`)
      }

      parsed.push({
        rowNumber,
        code,
        name,
        spec,
        category,
        customerCode,
        customerId: customerCode ? customerByCode.get(customerCode) || null : null,
        stockUnit,
        valuationUnit: valuationUnit || stockUnit,
        conversionRate: normalizeConversionRate(conversionRate),
        conversionNote,
        costingMethod,
      })
    })

    if (errors.length > 0) {
      return NextResponse.json({ error: '导入校验失败', details: errors }, { status: 400 })
    }

    const codes = parsed.map((item) => item.code)
    const existingMaterials = await prisma.material.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true, deletedAt: true },
    })
    const existingByCode = new Map(existingMaterials.map((material) => [material.code, material]))
    const archivedCodes = existingMaterials.filter((material) => material.deletedAt).map((material) => material.code)
    if (archivedCodes.length > 0) {
      return NextResponse.json({ error: `以下物料编码已被已归档记录占用：${archivedCodes.join('、')}` }, { status: 400 })
    }

    const summary = await prisma.$transaction(async (tx) => {
      let created = 0
      let updated = 0
      let skipped = 0

      for (const item of parsed) {
        const existing = existingByCode.get(item.code)
        const data = {
          code: item.code,
          name: item.name,
          spec: item.spec,
          category: item.category,
          customerId: item.customerId,
          unit: item.stockUnit,
          stockUnit: item.stockUnit,
          valuationUnit: item.valuationUnit,
          conversionRate: item.conversionRate,
          conversionNote: item.conversionNote || null,
          costingMethod: item.costingMethod,
        }

        if (existing) {
          if (mode !== 'update') {
            skipped += 1
            continue
          }

          await tx.material.update({
            where: { id: existing.id },
            data,
          })
          await tx.stock.upsert({
            where: { materialId: existing.id },
            create: { materialId: existing.id },
            update: {},
          })
          updated += 1
          continue
        }

        const material = await tx.material.create({ data })
        await tx.stock.create({ data: { materialId: material.id } })
        created += 1
      }

      return { total: parsed.length, created, updated, skipped }
    })

    await writeAuditLog(req, {
      action: mode === 'update' ? 'IMPORT_UPSERT' : 'IMPORT_CREATE',
      entityType: 'MATERIAL',
      entityLabel: '物料批量导入',
      afterData: summary,
      note: `文件：${file.name}`,
    })

    return NextResponse.json({ data: summary })
  } catch (error) {
    console.error('Import materials error:', error)
    return NextResponse.json({ error: '导入物料失败' }, { status: 500 })
  }
}
