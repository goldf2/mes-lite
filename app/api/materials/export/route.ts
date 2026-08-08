import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { parseCsvFilter } from '@/lib/status-filter'
import { csvResponse, toCsv } from '@/lib/csv'
import { sortByNaturalText } from '@/lib/natural-sort'
import { getSystemSettings } from '@/lib/system-settings'
import { getBomStatusRelationFilters } from '@/lib/bom-status-filter'
import { tokenizeKeywordQuery } from '@/lib/resource-search'

export const dynamic = 'force-dynamic'

const materialCategoryLabels: Record<string, string> = {
  RAW: '原材料',
  FINISHED: '成品',
  AUXILIARY: '辅材',
  SCRAP: '废料',
  DEFECTIVE: '废品',
  PACKAGING: '包装物',
  OTHER: '其他',
}

const costingMethodLabels: Record<string, string> = {
  WEIGHTED_AVERAGE: '移动加权平均',
  FIFO: '先入先出 FIFO',
}
const primaryMeasureLabels: Record<string, string> = {
  LENGTH: '长度',
  WEIGHT: '重量',
  QUANTITY: '数量',
  OTHER: '其他',
}

const materialSortFields = new Set(['createdAt', 'code', 'name', 'category', 'customer', 'spec', 'note', 'stockUnit', 'valuationUnit', 'costingMethod', 'stock', 'valuationStock'])

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materials', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const keyword = searchParams.get('keyword')
    const category = searchParams.get('category')
    const categories = parseCsvFilter(searchParams.get('categories'))
    const customerId = searchParams.get('customerId')
    const bomStatus = searchParams.get('bomStatus')
    if (bomStatus) {
      const bomDenied = await requireResourcePermission('bomCost', 'read')
      if (bomDenied) return bomDenied
    }
    const requestedSortBy = searchParams.get('sortBy') || 'createdAt'
    const sortBy = materialSortFields.has(requestedSortBy) ? requestedSortBy : 'createdAt'
    const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc'
    const naturalCodeSortEnabled = sortBy === 'code'
      && (await getSystemSettings()).naturalMaterialCodeSortEnabled
    const orderBy: any = sortBy === 'customer'
      ? { customer: { name: sortDir } }
      : sortBy === 'stock'
        ? { stock: { qty: sortDir } }
        : sortBy === 'valuationStock'
          ? { stock: { valuationQty: sortDir } }
          : { [sortBy]: sortDir }

    const where: any = { deletedAt: null }
    if (categories.length === 1) where.category = categories[0]
    else if (categories.length > 1) where.category = { in: categories }
    else if (category) where.category = category
    if (customerId === '__UNASSIGNED__') where.customerId = null
    else if (customerId) where.customerId = customerId
    const andFilters: any[] = [...getBomStatusRelationFilters(bomStatus)]
    andFilters.push(...tokenizeKeywordQuery(keyword || '').map((token) => ({ OR: [
      { name: { contains: token } },
      { code: { contains: token } },
      { spec: { contains: token } },
      { note: { contains: token } },
      { customer: { is: { code: { contains: token } } } },
      { customer: { is: { name: { contains: token } } } },
    ] })))
    if (andFilters.length > 0) where.AND = andFilters

    const queriedMaterials = await prisma.material.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        stock: {
          select: {
            qty: true,
            valuationQty: true,
            totalCost: true,
            valuationUnitCost: true,
            stockUnitCost: true,
          },
        },
      },
      orderBy,
    })

    const materials = naturalCodeSortEnabled
      ? sortByNaturalText(queriedMaterials, (material) => material.code, sortDir)
      : queriedMaterials

    const rows: unknown[][] = [
      [
        '物料编码',
        '物料名称',
        '规格',
        '备注',
        '分类',
        '分类名称',
        '归属客户',
        '主计量方式',
        '库存单位',
        '参考计量方式',
        '参考/计价单位',
        '默认参考换算',
        '成本方法',
        '成本方法名称',
        '默认销售价',
        '销售币种',
        '库存数量',
        '核算库存',
        '库存金额',
        '每核算单位成本',
        '每库存单位成本',
        '换算说明',
        '创建时间',
      ],
    ]

    for (const material of materials) {
      rows.push([
        material.code,
        material.name,
        material.spec || '',
        material.note || '',
        material.category,
        materialCategoryLabels[material.category] || material.category,
        material.customer?.name || '',
        primaryMeasureLabels[material.primaryMeasure] || material.primaryMeasure,
        material.stockUnit || material.unit,
        material.referenceMeasure ? primaryMeasureLabels[material.referenceMeasure] || material.referenceMeasure : '',
        material.valuationUnit || material.unit,
        material.conversionRate || 1,
        material.costingMethod,
        costingMethodLabels[material.costingMethod] || material.costingMethod,
        material.defaultSalePrice ?? '',
        material.salesCurrency || 'CNY',
        material.stock?.qty || 0,
        material.stock?.valuationQty || 0,
        material.stock?.totalCost || 0,
        material.stock?.valuationUnitCost || 0,
        material.stock?.stockUnitCost || 0,
        material.conversionNote || '',
        material.createdAt.toISOString(),
      ])
    }

    return csvResponse('materials-export.csv', toCsv(rows))
  } catch (error) {
    console.error('Export materials error:', error)
    return NextResponse.json({ error: '导出物料失败' }, { status: 500 })
  }
}
