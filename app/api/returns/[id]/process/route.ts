import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { resolveMaterialIdForProduct } from '@/lib/material-product'
import { getCurrentOperator } from '@/lib/auth'

const processSchema = z.object({
  processedBy: z.string().trim().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const denied = await requireResourcePermission('return', 'update')
    if (denied) return denied

    const body = await req.json().catch(() => ({}))
    const input = processSchema.parse(body)
    const operator = await getCurrentOperator()
    const processedBy = input.processedBy || operator?.name || operator?.username || '系统用户'

    const returnOrder = await prisma.returnOrder.findUnique({
      where: { id: params.id },
    })

    if (!returnOrder) {
      return NextResponse.json({ error: '退货单不存在' }, { status: 404 })
    }

    if (returnOrder.status !== 'PENDING') {
      return NextResponse.json({ error: '只能处理待处理状态的退货单' }, { status: 400 })
    }

    const materialId = await resolveMaterialIdForProduct(prisma, returnOrder.productId, returnOrder.materialId)

    await prisma.$transaction(async (tx) => {
      let stock = materialId
        ? await tx.stock.findUnique({ where: { materialId } })
        : await tx.stock.findUnique({ where: { productId: returnOrder.productId } })

      const beforeQty = stock ? Number(stock.qty) : 0
      const afterQty = beforeQty + returnOrder.qty
      const shipment = returnOrder.shipmentId
        ? await tx.shipment.findUnique({ where: { id: returnOrder.shipmentId } })
        : null
      const currentValuationRate = stock && Number(stock.qty) > 0
        ? Number(stock.valuationQty) / Number(stock.qty)
        : 1
      const currentStockUnitCost = stock && Number(stock.qty) > 0
        ? Number(stock.totalCost) / Number(stock.qty)
        : 0
      const returnValuationQty = shipment && shipment.qty > 0
        ? Number((Number(shipment.shippedValuationQty) * returnOrder.qty / shipment.qty).toFixed(6))
        : Number((returnOrder.qty * currentValuationRate).toFixed(6))
      const returnCostAmount = shipment && shipment.qty > 0
        ? Number((Number(shipment.shippedCostAmount) * returnOrder.qty / shipment.qty).toFixed(6))
        : Number((returnOrder.qty * currentStockUnitCost).toFixed(6))
      const beforeValuationQty = Number(stock?.valuationQty || 0)
      const afterValuationQty = beforeValuationQty + returnValuationQty
      const beforeCostAmount = Number(stock?.totalCost || 0)
      const afterCostAmount = beforeCostAmount + returnCostAmount

      if (stock) {
        stock = await tx.stock.update({
          where: { id: stock.id },
          data: {
            qty: { increment: returnOrder.qty },
            availableQty: { increment: returnOrder.qty },
            valuationQty: { increment: returnValuationQty },
            availableValuationQty: { increment: returnValuationQty },
            totalCost: { increment: returnCostAmount },
            valuationUnitCost: afterValuationQty > 0 ? afterCostAmount / afterValuationQty : 0,
            stockUnitCost: afterQty > 0 ? afterCostAmount / afterQty : 0,
          },
        })
      } else {
        stock = await tx.stock.create({
          data: {
            materialId,
            productId: materialId ? null : returnOrder.productId,
            qty: returnOrder.qty,
            reservedQty: 0,
            availableQty: returnOrder.qty,
            valuationQty: returnValuationQty,
            availableValuationQty: returnValuationQty,
            totalCost: returnCostAmount,
            valuationUnitCost: returnValuationQty > 0 ? returnCostAmount / returnValuationQty : 0,
            stockUnitCost: returnOrder.qty > 0 ? returnCostAmount / returnOrder.qty : 0,
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
          valuationQty: returnValuationQty,
          beforeValuationQty,
          afterValuationQty,
          costAmount: returnCostAmount,
          beforeCostAmount,
          afterCostAmount,
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
          materialId,
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
