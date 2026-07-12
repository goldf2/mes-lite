import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { restoreMaterialCost } from '@/lib/costing'

const cancelSchema = z.object({
  reason: z.string().min(1, '取消原因必填'),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const denied = await requireResourcePermission('orders', 'update')
    if (denied) return denied

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
      // 3.1 已领物料退库；未领物料释放预留。
      for (const pick of order.picks) {
        if (pick.material.stock) {
          const stock = await tx.stock.findUnique({
            where: { id: pick.material.stock.id },
          })

          if (stock && pick.actualQty > 0) {
            await restoreMaterialCost(tx, {
              pickItemId: pick.id,
              costingMethod: pick.costingMethod,
            })

            const beforeQty = Number(stock.qty)
            const beforeValuationQty = Number(stock.valuationQty)
            const beforeCostAmount = Number(stock.totalCost)
            const returnQty = Number(pick.actualQty)
            const returnValuationQty = Number(pick.actualValuationQty)
            const returnCostAmount = Number(pick.costAmount)
            const afterQty = Number((beforeQty + returnQty).toFixed(6))
            const afterValuationQty = Number((beforeValuationQty + returnValuationQty).toFixed(6))
            const afterCostAmount = Number((beforeCostAmount + returnCostAmount).toFixed(6))
            const nextValuationUnitCost = afterValuationQty > 0 ? afterCostAmount / afterValuationQty : 0
            const nextStockUnitCost = afterQty > 0 ? afterCostAmount / afterQty : 0

            await tx.stock.update({
              where: { id: stock.id },
              data: {
                qty: { increment: returnQty },
                availableQty: { increment: returnQty },
                valuationQty: { increment: returnValuationQty },
                availableValuationQty: { increment: returnValuationQty },
                totalCost: { increment: returnCostAmount },
                valuationUnitCost: Math.max(0, nextValuationUnitCost),
                stockUnitCost: Math.max(0, nextStockUnitCost),
              },
            })

            await tx.stockLog.create({
              data: {
                stockId: stock.id,
                type: 'RETURN',
                qty: returnQty,
                beforeQty,
                afterQty,
                valuationQty: returnValuationQty,
                beforeValuationQty,
                afterValuationQty,
                costAmount: returnCostAmount,
                beforeCostAmount,
                afterCostAmount,
                refType: 'RETURN',
                refId: pick.id,
                note: `工单 ${order.orderNo} 取消退料`,
              },
            })
          } else if (stock) {
            const requiredQty = Number(pick.requiredQty)
            const stockQty = Number(stock.qty)
            const conversionRate = Number(pick.conversionRateUsed || pick.material.conversionRate || 1)
            const valuationReserveQty = Number(pick.reservedValuationQty) > 0
              ? Number(pick.reservedValuationQty)
              : stockQty > 0
              ? Number((requiredQty * (Number(stock.valuationQty) / stockQty)).toFixed(6))
              : Number((requiredQty * conversionRate).toFixed(6))

            await tx.stock.update({
              where: { id: stock.id },
              data: {
                reservedQty: { decrement: requiredQty },
                availableQty: { increment: requiredQty },
                reservedValuationQty: { decrement: valuationReserveQty },
                availableValuationQty: { increment: valuationReserveQty },
              },
            })
          }
        }

        // 标记退料
        await tx.pickItem.update({
          where: { id: pick.id },
          data: { status: pick.actualQty > 0 ? 'RETURNED' : 'CANCELLED' },
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
