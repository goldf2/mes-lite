import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { consumeMaterialCost } from '@/lib/costing'
import { writeAuditLog } from '@/lib/audit'

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
    const denied = await requireResourcePermission('orders', 'update')
    if (denied) return denied

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
        const pick = await tx.pickItem.findFirst({
          where: { id: item.pickItemId, orderId },
          include: { material: { include: { stock: true } } },
        })
        if (!pick) throw new Error('领料项不存在')
        if (pick.status === 'COMPLETED') throw new Error(`物料 ${pick.material.name} 已完成领料，不可重复领料`)

        const stock = pick.material.stock
        if (!stock) throw new Error(`物料 ${pick.material.name} 无库存记录`)

        const requiredQty = Number(pick.requiredQty)
        const availableWithReserve = Number(stock.availableQty) + requiredQty
        if (availableWithReserve < item.actualQty) {
          throw new Error(`物料 ${pick.material.name} 库存不足`)
        }

        const availableDelta = requiredQty - item.actualQty
        const reservedValuationQty = Number(pick.reservedValuationQty) > 0
          ? Number(pick.reservedValuationQty)
          : stock.qty > 0
          ? Number((requiredQty * (Number(stock.valuationQty) / Number(stock.qty))).toFixed(6))
          : Number((requiredQty * Number(pick.material.conversionRate || 1)).toFixed(6))
        const costResult = await consumeMaterialCost(tx, {
          materialId: pick.materialId,
          issueStockQty: item.actualQty,
          stock: {
            id: stock.id,
            qty: Number(stock.qty),
            valuationQty: Number(stock.valuationQty),
            totalCost: Number(stock.totalCost),
            valuationUnitCost: Number(stock.valuationUnitCost),
          },
          material: {
            costingMethod: pick.material.costingMethod,
            conversionRate: Number(pick.material.conversionRate),
          },
        })
        if (costResult.layerConsumptions.length > 0) {
          await tx.costLayerConsumption.createMany({
            data: costResult.layerConsumptions.map((layer) => ({
              pickItemId: pick.id,
              costLayerId: layer.costLayerId,
              materialId: layer.materialId,
              stockQty: layer.stockQty,
              valuationQty: layer.valuationQty,
              costAmount: layer.costAmount,
              stockUnitCost: layer.stockUnitCost,
              valuationUnitCost: layer.valuationUnitCost,
            })),
          })
        }
        const beforeCostAmount = Number(stock.totalCost)
        const afterCostAmount = Number((beforeCostAmount - costResult.costAmount).toFixed(6))
        const afterQty = Number((Number(stock.qty) - item.actualQty).toFixed(6))
        const afterValuationQty = Number((Number(stock.valuationQty) - costResult.issueValuationQty).toFixed(6))
        const nextValuationUnitCost = afterValuationQty > 0 ? afterCostAmount / afterValuationQty : 0
        const nextStockUnitCost = afterQty > 0 ? afterCostAmount / afterQty : 0

        // 领料时从预留转为实际出库，释放对应预留，避免二次扣减可用库存。
        await tx.stock.update({
          where: { id: stock.id },
          data: {
            qty: { decrement: item.actualQty },
            reservedQty: { decrement: requiredQty },
            availableQty: { increment: availableDelta },
            valuationQty: { decrement: costResult.issueValuationQty },
            reservedValuationQty: { decrement: reservedValuationQty },
            availableValuationQty: { increment: Number((reservedValuationQty - costResult.issueValuationQty).toFixed(6)) },
            totalCost: { decrement: costResult.costAmount },
            valuationUnitCost: Math.max(0, nextValuationUnitCost),
            stockUnitCost: Math.max(0, nextStockUnitCost),
          },
        })

        // 记录库存日志
        await tx.stockLog.create({
          data: {
            stockId: stock.id,
            type: 'PICK',
            qty: -item.actualQty,
            beforeQty: stock.qty,
            afterQty,
            valuationQty: -costResult.issueValuationQty,
            beforeValuationQty: stock.valuationQty,
            afterValuationQty,
            costAmount: -costResult.costAmount,
            beforeCostAmount,
            afterCostAmount,
            refType: 'PICK',
            refId: pick.id,
            note: `工单 ${order.orderNo} 领料，成本法 ${pick.material.costingMethod}`,
            createdBy: item.pickedBy,
          },
        })

        // 更新领料项
        await tx.pickItem.update({
          where: { id: pick.id },
          data: {
            actualQty: item.actualQty,
            actualValuationQty: costResult.issueValuationQty,
            conversionRateUsed: costResult.conversionRateUsed,
            conversionSource: costResult.conversionSource,
            costAmount: costResult.costAmount,
            costingMethod: pick.material.costingMethod,
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

    await writeAuditLog(req, {
      action: 'PICK',
      entityType: 'ORDER',
      entityId: order.id,
      entityLabel: order.orderNo,
      afterData: items,
      note: '工单领料扣减库存和成本',
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
