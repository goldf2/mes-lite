import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { resolveMaterialIdForProduct } from '@/lib/material-product'

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
    const stock = materialId
      ? await prisma.stock.findUnique({ where: { materialId } })
      : shipment.product.stock

    if (!stock) {
      return NextResponse.json({ error: '物料库存记录不存在' }, { status: 400 })
    }

    if (Number(stock.availableQty) < shipment.qty) {
      return NextResponse.json(
        { error: `库存不足，当前可用库存 ${stock.availableQty}，需发货 ${shipment.qty}` },
        { status: 400 }
      )
    }

    await prisma.$transaction(async (tx) => {
      // a. 统一从物料主数据库存扣减；无法映射的历史单据才回退旧库存。
      const currentStock = await tx.stock.findUnique({
        where: { id: stock.id },
      })

      if (!currentStock) {
        throw new Error('库存记录不存在')
      }

      // b. 校验库存充足
      if (Number(currentStock.availableQty) < shipment.qty) {
        throw new Error('库存不足')
      }

      const beforeQty = Number(currentStock.qty)
      const afterQty = beforeQty - shipment.qty
      const stockToValuationRate = beforeQty > 0 ? Number(currentStock.valuationQty) / beforeQty : 0
      const shippedValuationQty = Number((shipment.qty * stockToValuationRate).toFixed(6))
      const shippedCostAmount = Number((shipment.qty * Number(currentStock.stockUnitCost)).toFixed(6))
      const beforeValuationQty = Number(currentStock.valuationQty)
      const afterValuationQty = Math.max(0, Number((beforeValuationQty - shippedValuationQty).toFixed(6)))
      const beforeCostAmount = Number(currentStock.totalCost)
      const afterCostAmount = Math.max(0, Number((beforeCostAmount - shippedCostAmount).toFixed(6)))

      await tx.stock.update({
        where: { id: stock.id },
        data: {
          qty: { decrement: shipment.qty },
          availableQty: { decrement: shipment.qty },
          valuationQty: afterValuationQty,
          availableValuationQty: Math.max(0, Number((Number(currentStock.availableValuationQty) - shippedValuationQty).toFixed(6))),
          totalCost: afterCostAmount,
          valuationUnitCost: afterValuationQty > 0 ? afterCostAmount / afterValuationQty : 0,
          stockUnitCost: afterQty > 0 ? afterCostAmount / afterQty : 0,
        },
      })

      await tx.stockLog.create({
        data: {
          stockId: stock.id,
          type: 'OUT',
          qty: -shipment.qty,
          beforeQty,
          afterQty,
          valuationQty: -shippedValuationQty,
          beforeValuationQty,
          afterValuationQty,
          costAmount: -shippedCostAmount,
          beforeCostAmount,
          afterCostAmount,
          refType: 'SHIPMENT',
          refId: shipment.id,
          note: `发货单 ${shipment.shipmentNo} 出库`,
        },
      })

      // e. 更新发货单 status='SHIPPED', shippedAt=now
      await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          status: 'SHIPPED',
          shippedAt: new Date(),
          materialId,
          shippedValuationQty,
          shippedCostAmount,
        },
      })
    })

    return NextResponse.json({ success: true, message: '发货成功' })
  } catch (error) {
    console.error('Ship shipment error:', error)
    return NextResponse.json({ error: '确认发货失败' }, { status: 500 })
  }
}
