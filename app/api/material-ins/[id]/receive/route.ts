import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// PATCH: 确认收货入库
export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params

    const materialIn = await prisma.materialIn.findUnique({
      where: { id },
      include: { material: true },
    })

    if (!materialIn) {
      return NextResponse.json({ error: '来料单不存在' }, { status: 404 })
    }

    if (materialIn.status !== 'PENDING') {
      return NextResponse.json({ error: '来料单状态不是待收货，无法确认收货' }, { status: 400 })
    }

    const qty = Number(materialIn.qty)
    const materialId = materialIn.materialId

    await prisma.$transaction(async (tx) => {
      // a. 查找或创建该物料的 Stock 记录
      let stock = await tx.stock.findUnique({
        where: { materialId },
      })

      let beforeQty: number
      if (!stock) {
        stock = await tx.stock.create({
          data: {
            materialId,
            qty: 0,
            reservedQty: 0,
            availableQty: 0,
          },
        })
        beforeQty = 0
      } else {
        beforeQty = Number(stock.qty)
      }

      const afterQty = beforeQty + qty

      // b. 增加 stock.qty 和 stock.availableQty
      await tx.stock.update({
        where: { id: stock.id },
        data: {
          qty: { increment: qty },
          availableQty: { increment: qty },
        },
      })

      // c. 创建 StockLog 记录
      await tx.stockLog.create({
        data: {
          stockId: stock.id,
          type: 'IN',
          qty: qty,
          beforeQty: beforeQty,
          afterQty: afterQty,
          refType: 'MATERIAL_IN',
          refId: id,
          note: `来料入库: ${materialIn.inboundNo}`,
        },
      })

      // d. 更新来料单 status='RECEIVED', inboundDate=now
      await tx.materialIn.update({
        where: { id },
        data: {
          status: 'RECEIVED',
          inboundDate: new Date(),
        },
      })
    })

    return NextResponse.json({ success: true, message: '收货成功' })
  } catch (error) {
    console.error('Receive material-in error:', error)
    return NextResponse.json({ error: '确认收货失败' }, { status: 500 })
  }
}
