import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { processReturnSchema } from '@/modules/sales/contracts/fulfillment-schema'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { processManagedReturn } from '@/modules/sales/server/fulfillment-status-service'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('return', 'update')
    if (denied) return denied
    const input = processReturnSchema.parse(await req.json().catch(() => ({})))
    const operator = await getCurrentOperator()
    const processedBy = input.processedBy || operator?.name || operator?.username || '系统用户'
    await processManagedReturn(params.id, processedBy)
    return NextResponse.json({ success: true, message: '退货处理成功' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Process return error:', error)
    return NextResponse.json({ error: '处理退货失败' }, { status: 500 })
  }
}
