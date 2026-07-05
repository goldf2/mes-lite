import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// PATCH: 确认发货（扣减库存）
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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

    const stock = shipment.product.stock

    if (!stock) {
      return NextResponse.json({ error: '产品库存记录不存在' }, { status: 400 })
    }

    if (Number(stock.availableQty) < shipment.qty) {
      return NextResponse.json(
        { error: `库存不足，当前可用库存 ${stock.availableQty}，需发货 ${shipment.qty}` },
        { status: 400 }
      )
    }

    await prisma.$transaction(async (tx) => {
      // a. 查找该产品的 Stock 记录
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

      // c. 扣减 stock.qty 和 stock.availableQty
      await tx.stock.update({
        where: { id: stock.id },
        data: {
          qty: { decrement: shipment.qty },
          availableQty: { decrement: shipment.qty },
        },
      })

      // d. 创建 StockLog 记录
      await tx.stockLog.create({
        data: {
          stockId: stock.id,
          type: 'OUT',
          qty: shipment.qty,
          beforeQty,
          afterQty,
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
        },
      })
    })

    return NextResponse.json({ success: true, message: '发货成功' })
  } catch (error) {
    console.error('Ship shipment error:', error)
    return NextResponse.json({ error: '确认发货失败' }, { status: 500 })
  }
}
