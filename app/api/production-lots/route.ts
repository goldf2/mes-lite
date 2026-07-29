import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('productionLots', 'read')
    if (denied) return denied
    const { searchParams } = new URL(req.url)
    const keyword = searchParams.get('keyword')?.trim()
    const status = searchParams.get('status')?.trim()
    const page = Math.max(1, Number(searchParams.get('page') || 1))
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || 50)))
    const where: any = {}
    if (status) where.status = status
    if (keyword) {
      where.OR = [
        { lotNo: { contains: keyword } },
        { outputMaterial: { is: { code: { contains: keyword } } } },
        { outputMaterial: { is: { name: { contains: keyword } } } },
        { productionOrder: { is: { orderNo: { contains: keyword } } } },
        { cuttingTask: { is: { taskNo: { contains: keyword } } } },
      ]
    }
    const [data, total] = await Promise.all([
      prisma.productionLot.findMany({
        where,
        include: {
          outputMaterial: {
            select: { id: true, code: true, name: true, spec: true, stockUnit: true, valuationUnit: true },
          },
          productionOrder: {
            select: { id: true, orderNo: true, voucherNo: true, planQty: true, status: true },
          },
          cuttingDemand: {
            select: { id: true, demandNo: true, pieceLengthMm: true, rawMaterialCodeSnapshot: true },
          },
          cuttingTask: {
            select: {
              id: true,
              taskNo: true,
              status: true,
              sources: {
                select: {
                  sourceEntity: { select: { id: true, entityNo: true, batchNo: true } },
                  remnantEntity: { select: { id: true, entityNo: true, actualLengthMm: true } },
                },
              },
            },
          },
          drillingReports: { orderBy: { createdAt: 'desc' } },
          qualityInspections: { orderBy: { createdAt: 'desc' } },
          stockIns: { orderBy: { inDate: 'desc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.productionLot.count({ where }),
    ])
    const active = data.filter((lot) => lot.status !== 'REVERSED')
    return NextResponse.json({
      data,
      summary: {
        waitingDrillingQty: active.reduce((sum, lot) => sum + lot.pendingDrillingQty, 0),
        waitingQcQty: active.reduce((sum, lot) => sum + lot.pendingQcQty, 0),
        reworkQty: active.reduce((sum, lot) => sum + lot.reworkQty, 0),
        availableStockInQty: active.reduce((sum, lot) => sum + Math.max(0, lot.passedQty - lot.stockedQty), 0),
      },
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    console.error('Get production lots error:', error)
    return NextResponse.json({ error: '获取生产批次失败' }, { status: 500 })
  }
}
