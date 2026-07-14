import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { parseCsvFilter } from '@/lib/status-filter'
import { csvResponse, toCsv } from '@/lib/csv'

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

const materialSortFields = new Set(['createdAt', 'code', 'name', 'category', 'spec', 'stockUnit', 'valuationUnit', 'costingMethod'])

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materials', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const keyword = searchParams.get('keyword')
    const category = searchParams.get('category')
    const categories = parseCsvFilter(searchParams.get('categories'))
    const customerId = searchParams.get('customerId')
    const requestedSortBy = searchParams.get('sortBy') || 'createdAt'
    const sortBy = materialSortFields.has(requestedSortBy) ? requestedSortBy : 'createdAt'
    const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc'

    const where: any = { deletedAt: null }
    if (categories.length === 1) where.category = categories[0]
    else if (categories.length > 1) where.category = { in: categories }
    else if (category) where.category = category
    if (customerId === '__UNASSIGNED__') where.customerId = null
    else if (customerId) where.customerId = customerId
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
      ]
    }

    const materials = await prisma.material.findMany({
      where,
      include: {
        customer: { select: { code: true, name: true } },
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
      orderBy: { [sortBy]: sortDir },
    })

    const rows: unknown[][] = [
      [
        '物料编码',
        '物料名称',
        '规格',
        '备注',
        '分类',
        '分类名称',
        '客户编码',
        '客户名称',
        '库存单位',
        '核算单位',
        '换算系数',
        '成本方法',
        '成本方法名称',
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
        material.customer?.code || '',
        material.customer?.name || '',
        material.stockUnit || material.unit,
        material.valuationUnit || material.unit,
        material.conversionRate || 1,
        material.costingMethod,
        costingMethodLabels[material.costingMethod] || material.costingMethod,
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
