import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

// PATCH: 确认收货入库
export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('materialIn', 'update')
    if (denied) return denied

    const { id } = params

    const materialIn = await prisma.materialIn.findUnique({
      where: { id },
      include: { material: true },
    })

    if (!materialIn) {
      return NextResponse.json({ error: '来料单不存在' }, { status: 404 })
    }

    if (materialIn.material.deletedAt) {
      return NextResponse.json({ error: '物料已删除，无法确认收货' }, { status: 400 })
    }

    if (materialIn.status !== 'PENDING') {
      return NextResponse.json({ error: '来料单状态不是待收货，无法确认收货' }, { status: 400 })
    }

    const qty = Number(materialIn.qty)
    const valuationQty = Number(materialIn.valuationQty)
    const costAmount = Number(materialIn.totalAmount)
    const materialId = materialIn.materialId

    const result = await prisma.$transaction(async (tx) => {
      // a. 查找或创建该物料的 Stock 记录
      let stock = await tx.stock.findUnique({
        where: { materialId },
      })

      let beforeQty: number
      let beforeValuationQty: number
      let beforeCostAmount: number
      if (!stock) {
        stock = await tx.stock.create({
          data: {
            materialId,
            qty: 0,
            reservedQty: 0,
            availableQty: 0,
            valuationQty: 0,
            reservedValuationQty: 0,
            availableValuationQty: 0,
            totalCost: 0,
            valuationUnitCost: 0,
            stockUnitCost: 0,
          },
        })
        beforeQty = 0
        beforeValuationQty = 0
        beforeCostAmount = 0
      } else {
        beforeQty = Number(stock.qty)
        beforeValuationQty = Number(stock.valuationQty)
        beforeCostAmount = Number(stock.totalCost)
      }

      const afterQty = beforeQty + qty
      const afterValuationQty = beforeValuationQty + valuationQty
      const afterCostAmount = beforeCostAmount + costAmount
      const valuationUnitCost = afterValuationQty > 0 ? afterCostAmount / afterValuationQty : 0
      const stockUnitCost = afterQty > 0 ? afterCostAmount / afterQty : 0

      // b. 增加 stock.qty 和 stock.availableQty
      await tx.stock.update({
        where: { id: stock.id },
        data: {
          qty: { increment: qty },
          availableQty: { increment: qty },
          valuationQty: { increment: valuationQty },
          availableValuationQty: { increment: valuationQty },
          totalCost: { increment: costAmount },
          valuationUnitCost,
          stockUnitCost,
        },
      })

      await tx.inventoryCostLayer.create({
        data: {
          materialId,
          materialInId: id,
          stockQty: qty,
          remainingStockQty: qty,
          valuationQty,
          remainingValuationQty: valuationQty,
          stockUnit: materialIn.unit,
          valuationUnit: materialIn.valuationUnit,
          valuationUnitCost: Number(materialIn.unitPrice),
          stockUnitCost: Number(materialIn.stockUnitCost),
          totalAmount: costAmount,
          remainingAmount: costAmount,
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
          valuationQty,
          beforeValuationQty,
          afterValuationQty,
          costAmount,
          beforeCostAmount,
          afterCostAmount,
          refType: 'MATERIAL_IN',
          refId: id,
          note: `来料入库: ${materialIn.inboundNo}`,
        },
      })

      // d. 更新来料单 status='RECEIVED', inboundDate=now
      return tx.materialIn.update({
        where: { id },
        data: {
          status: 'RECEIVED',
          inboundDate: new Date(),
        },
      })
    })

    await writeAuditLog(_req, {
      action: 'RECEIVE',
      entityType: 'MATERIAL_IN',
      entityId: result.id,
      entityLabel: result.inboundNo,
      beforeData: materialIn,
      afterData: result,
    })

    return NextResponse.json({ success: true, message: '收货成功' })
  } catch (error) {
    console.error('Receive material-in error:', error)
    return NextResponse.json({ error: '确认收货失败' }, { status: 500 })
  }
}
