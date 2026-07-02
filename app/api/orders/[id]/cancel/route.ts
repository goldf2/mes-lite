import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const cancelSchema = z.object({
  reason: z.string().min(1, '取消原因必填'),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()
    const { reason } = cancelSchema.parse(body)

    const order = await prisma.productionOrder.findUnique({
      where: { id: params.id },
      include: {
        picks: { include: { material: { include: { stock: true } } } },
        reports: true,
        stockIns: true,
      },
    })

    if (!order) {
      return NextResponse.json({ error: '工单不存在' }, { status: 404 })
    }

    // 1. 已入库禁止取消
    if (order.status === 'COMPLETED') {
      return NextResponse.json(
        { error: '已入库工单不可取消，请先创建退货单' },
        { status: 400 }
      )
    }

    // 2. 已取消禁止重复取消
    if (order.status === 'CANCELLED') {
      return NextResponse.json({ error: '工单已取消' }, { status: 400 })
    }

    // 3. 如果已入库（stockIns 存在），禁止取消
    if (order.stockIns.length > 0) {
      return NextResponse.json(
        { error: '工单已有成品入库记录，不可取消' },
        { status: 400 }
      )
    }

    // 事务回退
    await prisma.$transaction(async (tx) => {
      // 3.1 已领物料全部回退
      for (const pick of order.picks) {
        if (pick.actualQty > 0 && pick.material.stock) {
          const stock = await tx.stock.findUnique({
            where: { id: pick.material.stock.id },
          })

          if (stock) {
            await tx.stock.update({
              where: { id: stock.id },
              data: {
                qty: { increment: pick.actualQty },
                availableQty: { increment: pick.actualQty },
                reservedQty: { decrement: pick.requiredQty },
              },
            })

            await tx.stockLog.create({
              data: {
                stockId: stock.id,
                type: 'RETURN',
                qty: pick.actualQty,
                beforeQty: stock.qty,
                afterQty: stock.qty + Number(pick.actualQty),
                refType: 'RETURN',
                refId: pick.id,
                note: `工单 ${order.orderNo} 取消退料`,
              },
            })
          }
        }

        // 标记退料
        await tx.pickItem.update({
          where: { id: pick.id },
          data: { status: 'RETURNED' },
        })
      }

      // 3.2 已报工记录标记作废（逻辑删除：备注标记）
      if (order.reports.length > 0) {
        await tx.workReport.updateMany({
          where: { orderId: order.id },
          data: { remark: '工单取消作废' },
        })
      }

      // 3.3 状态变更
      await tx.productionOrder.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          cancelTime: new Date(),
          cancelReason: reason,
        },
      })
    })

    return NextResponse.json({
      success: true,
      message: `工单 ${order.orderNo} 已取消，物料已退库`,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Cancel order error:', error)
    return NextResponse.json({ error: '取消工单失败' }, { status: 500 })
  }
}
