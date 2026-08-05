import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { resolveMaterialIdForProduct } from '@/lib/material-product'
import { postInventoryIssue } from '@/lib/inventory'
import { refreshSalesOrderStatus } from '@/lib/sales-orders'

// PATCH: 确认发货（扣减库存）
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const denied = await requireResourcePermission('shipment', 'update')
    if (denied) return denied

    const shipment = await prisma.shipment.findUnique({
      where: { id: params.id },
      include: { product: { include: { stock: true } } },
    })

    if (!shipment) {
      return NextResponse.json({ error: '发货单不存在' }, { status: 404 })
    }

    if (shipment.status !== 'PENDING') {
      return NextResponse.json(
        { error: '只能确认待发货状态的发货单' },
        { status: 400 }
      )
    }

    const materialId = await resolveMaterialIdForProduct(prisma, shipment.productId, shipment.materialId)
    if (!materialId) return NextResponse.json({ error: '发货对象未关联统一物料档案' }, { status: 400 })

    await prisma.$transaction(async (tx) => {
      if (shipment.salesOrderItemId) {
        const salesItem = await tx.salesOrderItem.findUnique({ where: { id: shipment.salesOrderItemId } })
        if (!salesItem) throw new Error('关联的销售订单明细不存在')
        if (Number(salesItem.shippedQty) + Number(shipment.qty) > Number(salesItem.qty) + 0.000001) {
          throw new Error('累计发货数量超过销售订单数量')
        }
      }

      const issue = await postInventoryIssue(tx, {
        materialId,
        stockQty: Number(shipment.qty),
        type: 'OUT',
        refType: 'SHIPMENT',
        refId: shipment.id,
        note: `发货单 ${shipment.shipmentNo} 出库`,
        createdBy: shipment.shippedBy,
        idempotencyKey: `SHIPMENT:${shipment.id}:SHIP`,
        locationId: shipment.locationId,
      })

      await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          status: 'SHIPPED',
          shippedAt: new Date(),
          materialId,
          shippedValuationQty: issue.valuationQty,
          shippedCostAmount: issue.costAmount,
          stockUnitSnapshot: issue.material?.stockUnit,
          valuationUnitSnapshot: issue.material?.valuationUnit,
          conversionRateUsed: issue.conversionRateUsed,
          conversionSource: issue.conversionSource,
        },
      })

      if (shipment.salesOrderItemId && shipment.salesOrderId) {
        await tx.salesOrderItem.update({
          where: { id: shipment.salesOrderItemId },
          data: { shippedQty: { increment: Number(shipment.qty) } },
        })
        await refreshSalesOrderStatus(tx, shipment.salesOrderId)
      }
    })

    return NextResponse.json({ success: true, message: '发货成功' })
  } catch (error) {
    console.error('Ship shipment error:', error)
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ error: '确认发货失败' }, { status: 500 })
  }
}
