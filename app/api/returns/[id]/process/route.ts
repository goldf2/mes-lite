import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { resolveMaterialIdForProduct } from '@/lib/material-product'
import { getCurrentOperator } from '@/lib/auth'
import { postInventoryReceipt } from '@/lib/inventory'

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
    if (!materialId) return NextResponse.json({ error: '退货对象未关联统一物料档案' }, { status: 400 })

    await prisma.$transaction(async (tx) => {
      const stock = await tx.stock.findUnique({ where: { materialId } })
      const material = await tx.material.findUnique({
        where: { id: materialId },
        select: { conversionRate: true },
      })
      const shipment = returnOrder.shipmentId
        ? await tx.shipment.findUnique({ where: { id: returnOrder.shipmentId } })
        : null
      const currentValuationRate = stock && Number(stock.qty) > 0
        ? Number(stock.valuationQty) / Number(stock.qty)
        : Number(material?.conversionRate || 1)
      const currentStockUnitCost = stock && Number(stock.qty) > 0
        ? Number(stock.totalCost) / Number(stock.qty)
        : 0
      const returnValuationQty = shipment && shipment.qty > 0
        ? Number((Number(shipment.shippedValuationQty) * returnOrder.qty / shipment.qty).toFixed(6))
        : Number((returnOrder.qty * currentValuationRate).toFixed(6))
      const returnCostAmount = shipment && shipment.qty > 0
        ? Number((Number(shipment.shippedCostAmount) * returnOrder.qty / shipment.qty).toFixed(6))
        : Number((returnOrder.qty * currentStockUnitCost).toFixed(6))
      const sourceMovement = shipment
        ? await tx.stockLog.findFirst({
            where: { refType: 'SHIPMENT', refId: shipment.id, type: 'OUT' },
            orderBy: { createdAt: 'desc' },
          })
        : null
      const receipt = await postInventoryReceipt(tx, {
        materialId,
        stockQty: Number(returnOrder.qty),
        valuationQty: returnValuationQty,
        conversionSource: shipment ? 'ORIGINAL_MOVEMENT' : 'LEGACY_ESTIMATE',
        costAmount: returnCostAmount,
        type: 'RETURN_IN',
        refType: 'RETURN',
        refId: returnOrder.id,
        note: `退货单 ${returnOrder.returnNo} 退回入库`,
        createdBy: processedBy,
        idempotencyKey: `RETURN:${returnOrder.id}:PROCESS`,
        sourceMovementId: sourceMovement?.id,
      })

      await tx.returnOrder.update({
        where: { id: returnOrder.id },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          processedBy,
          materialId,
          processedValuationQty: returnValuationQty,
          processedCostAmount: returnCostAmount,
          stockUnitSnapshot: receipt.material?.stockUnit,
          valuationUnitSnapshot: receipt.material?.valuationUnit,
          conversionRateUsed: receipt.quantities?.conversionRateUsed,
          conversionSource: shipment ? 'ORIGINAL_MOVEMENT' : 'LEGACY_ESTIMATE',
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
