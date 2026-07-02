import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const pickSchema = z.object({
  items: z.array(
    z.object({
      pickItemId: z.string(),
      actualQty: z.number().positive(),
      pickedBy: z.string().min(1),
    })
  ),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()
    const { items } = pickSchema.parse(body)

    const orderId = params.id

    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      include: {
        picks: { include: { material: { include: { stock: true } } } },
      },
    })

    if (!order) {
      return NextResponse.json({ error: '工单不存在' }, { status: 404 })
    }

    if (order.status !== 'CONFIRMED') {
      return NextResponse.json(
        { error: `工单状态为 ${order.status}，不可领料` },
        { status: 400 }
      )
    }

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const pick = order.picks.find(p => p.id === item.pickItemId)
        if (!pick) throw new Error('领料项不存在')

        const stock = pick.material.stock
        if (!stock) throw new Error(`物料 ${pick.material.name} 无库存记录`)

        if (Number(stock.availableQty) < item.actualQty) {
          throw new Error(`物料 ${pick.material.name} 库存不足`)
        }

        // 更新库存
        await tx.stock.update({
          where: { id: stock.id },
          data: {
            qty: { decrement: item.actualQty },
            availableQty: { decrement: item.actualQty },
            // reservedQty 已经在创建工单时预留，实际出库时不再扣 reserved
          },
        })

        // 记录库存日志
        await tx.stockLog.create({
          data: {
            stockId: stock.id,
            type: 'PICK',
            qty: -item.actualQty,
            beforeQty: stock.qty,
            afterQty: stock.qty - item.actualQty,
            refType: 'PICK',
            refId: pick.id,
            note: `工单 ${order.orderNo} 领料`,
            createdBy: item.pickedBy,
          },
        })

        // 更新领料项
        await tx.pickItem.update({
          where: { id: pick.id },
          data: {
            actualQty: item.actualQty,
            status: 'COMPLETED',
            pickedAt: new Date(),
            pickedBy: item.pickedBy,
          },
        })
      }

      // 检查是否所有领料完成
      const allPicked = await tx.pickItem.findMany({
        where: { orderId },
      })

      const allDone = allPicked.every(p => p.status === 'COMPLETED')
      if (allDone) {
        await tx.productionOrder.update({
          where: { id: orderId },
          data: { status: 'PICKED' },
        })
      }
    })

    return NextResponse.json({ success: true, message: '领料完成' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Pick error:', error)
    return NextResponse.json({ error: '领料失败' }, { status: 500 })
  }
}
