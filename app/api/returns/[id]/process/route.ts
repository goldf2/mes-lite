import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const processSchema = z.object({
  processedBy: z.string().min(1, '处理人必填'),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()
    const { processedBy } = processSchema.parse(body)

    const returnOrder = await prisma.returnOrder.findUnique({
      where: { id: params.id },
    })

    if (!returnOrder) {
      return NextResponse.json({ error: '退货单不存在' }, { status: 404 })
    }

    if (returnOrder.status !== 'PENDING') {
      return NextResponse.json({ error: '只能处理待处理状态的退货单' }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      // a. 查找或创建该产品的 Stock 记录
      let stock = await tx.stock.findUnique({
        where: { productId: returnOrder.productId },
      })

      const beforeQty = stock ? Number(stock.qty) : 0
      const afterQty = beforeQty + returnOrder.qty

      if (stock) {
        // b. 增加 stock.qty 和 stock.availableQty
        stock = await tx.stock.update({
          where: { id: stock.id },
          data: {
            qty: { increment: returnOrder.qty },
            availableQty: { increment: returnOrder.qty },
          },
        })
      } else {
        stock = await tx.stock.create({
          data: {
            productId: returnOrder.productId,
            qty: returnOrder.qty,
            reservedQty: 0,
            availableQty: returnOrder.qty,
          },
        })
      }

      // c. 创建 StockLog 记录
      await tx.stockLog.create({
        data: {
          stockId: stock.id,
          type: 'RETURN_IN',
          qty: returnOrder.qty,
          beforeQty,
          afterQty,
          refType: 'RETURN',
          refId: returnOrder.id,
          note: `退货单 ${returnOrder.returnNo} 退回入库`,
          createdBy: processedBy,
        },
      })

      // d. 更新退货单状态
      await tx.returnOrder.update({
        where: { id: returnOrder.id },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          processedBy,
        },
      })
    })

    return NextResponse.json({ success: true, message: '退货处理成功' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Process return error:', error)
    return NextResponse.json({ error: '处理退货失败' }, { status: 500 })
  }
}
