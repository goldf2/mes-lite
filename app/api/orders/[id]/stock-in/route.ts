import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const stockInSchema = z.object({
  qty: z.number().int().positive(),
  batchNo: z.string().optional(),
  inBy: z.string().min(1),
  note: z.string().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()
    const { qty, batchNo, inBy, note } = stockInSchema.parse(body)

    const orderId = params.id

    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      include: { product: true },
    })

    if (!order) {
      return NextResponse.json({ error: '工单不存在' }, { status: 404 })
    }

    if (order.status !== 'QC_DONE') {
      return NextResponse.json(
        { error: `工单状态为 ${order.status}，未质检通过不可入库` },
        { status: 400 }
      )
    }

    await prisma.$transaction(async (tx) => {
      // 1. 创建入库记录
      await tx.stockIn.create({
        data: {
          orderId,
          productId: order.productId,
          qty,
          batchNo,
          inBy,
          note,
        },
      })

      // 2. 更新成品库存
      const stock = await tx.stock.findUnique({
        where: { productId: order.productId },
      })

      if (stock) {
        await tx.stock.update({
          where: { id: stock.id },
          data: {
            qty: { increment: qty },
            availableQty: { increment: qty },
          },
        })

        await tx.stockLog.create({
          data: {
            stockId: stock.id,
            type: 'STOCK_IN',
            qty,
            beforeQty: stock.qty,
            afterQty: stock.qty + qty,
            refType: 'STOCK_IN',
            refId: orderId,
            note: `工单 ${order.orderNo} 成品入库`,
            createdBy: inBy,
          },
        })
      } else {
        // 新建库存记录
        await tx.stock.create({
          data: {
            productId: order.productId,
            qty,
            availableQty: qty,
            reservedQty: 0,
          },
        })
      }

      // 3. 更新工单状态
      await tx.productionOrder.update({
        where: { id: orderId },
        data: {
          status: 'COMPLETED',
          completeQty: qty,
          completeTime: new Date(),
        },
      })
    })

    return NextResponse.json({ success: true, message: '入库成功' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Stock in error:', error)
    return NextResponse.json({ error: '入库失败' }, { status: 500 })
  }
}
