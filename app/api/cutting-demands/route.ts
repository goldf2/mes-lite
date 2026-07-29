import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const allowedStatuses = new Set(['OPEN', 'PARTIALLY_PLANNED', 'PLANNED', 'COMPLETED', 'CANCELLED'])

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('cuttingPlans', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const keyword = searchParams.get('keyword')?.trim()
    const productionOrderId = searchParams.get('productionOrderId')?.trim()
    const rawMaterialId = searchParams.get('rawMaterialId')?.trim()
    const statuses = (searchParams.get('statuses') || '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => allowedStatuses.has(value))
    const page = Math.max(1, Number(searchParams.get('page') || 1))
    const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize') || 50)))

    const where: any = {}
    if (productionOrderId) where.productionOrderId = productionOrderId
    if (rawMaterialId) where.rawMaterialId = rawMaterialId
    if (statuses.length > 0) where.status = { in: statuses }
    if (keyword) {
      where.OR = [
        { demandNo: { contains: keyword } },
        { outputCodeSnapshot: { contains: keyword } },
        { outputNameSnapshot: { contains: keyword } },
        { rawMaterialCodeSnapshot: { contains: keyword } },
        { rawMaterialNameSnapshot: { contains: keyword } },
        { productionOrder: { is: { orderNo: { contains: keyword } } } },
      ]
    }

    const [data, total, openDemands] = await Promise.all([
      prisma.cuttingDemand.findMany({
        where,
        include: {
          productionOrder: {
            select: { id: true, orderNo: true, voucherNo: true, status: true, dueDate: true },
          },
          outputMaterial: {
            select: { id: true, code: true, name: true, spec: true, stockUnit: true },
          },
          rawMaterial: {
            select: {
              id: true,
              code: true,
              name: true,
              spec: true,
              stockUnit: true,
              profileSpec: true,
            },
          },
          planLines: {
            include: { plan: { select: { id: true, planNo: true, status: true } } },
            orderBy: { plan: { createdAt: 'desc' } },
          },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.cuttingDemand.count({ where }),
      prisma.cuttingDemand.findMany({
        where: { status: { in: ['OPEN', 'PARTIALLY_PLANNED'] } },
        select: { requiredQty: true, plannedQty: true },
      }),
    ])

    return NextResponse.json({
      data,
      summary: {
        openDemandCount: openDemands.length,
        remainingQty: openDemands.reduce((sum, item) => sum + Math.max(0, item.requiredQty - item.plannedQty), 0),
      },
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    console.error('Get cutting demands error:', error)
    return NextResponse.json({ error: '获取切割需求失败' }, { status: 500 })
  }
}
