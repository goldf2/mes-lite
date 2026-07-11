import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

// GET: 指定工单的所有成本记录
export async function GET(
  req: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const denied = await requireResourcePermission('stats', 'read')
    if (denied) return denied

    const { orderId } = params

    const records = await prisma.costRecord.findMany({
      where: { orderId },
      include: { order: true },
      orderBy: { date: 'desc' },
    })

    const totalAmount = records.reduce((sum, r) => sum + Number(r.amount), 0)

    return NextResponse.json({ data: records, totalAmount })
  } catch (error) {
    console.error('Get order costs error:', error)
    return NextResponse.json({ error: '获取工单成本明细失败' }, { status: 500 })
  }
}
