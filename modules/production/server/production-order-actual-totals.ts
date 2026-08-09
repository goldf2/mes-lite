import type { Prisma } from '@prisma/client'

const roundQty = (value: number) => Number(value.toFixed(6))

export async function recalculateProductionOrderTotals(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.productionOrder.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('生产订单不存在')
  const actuals = await tx.productionOrderActual.findMany({
    where: { orderId, status: 'CONFIRMED' },
    include: { outputs: { include: { material: { select: { category: true } } } } },
  })
  let completeQty = 0
  let scrapQty = 0
  for (const actual of actuals) {
    for (const output of actual.outputs) {
      if (output.isPrimary) completeQty += Number(output.actualQty)
      if (['SCRAP', 'DEFECTIVE'].includes(output.material.category)) scrapQty += Number(output.actualQty)
    }
  }
  completeQty = roundQty(completeQty)
  scrapQty = roundQty(scrapQty)
  const completed = completeQty + 0.000001 >= Number(order.planQty)
  const hasConfirmedActual = actuals.length > 0
  await tx.productionOrder.update({
    where: { id: orderId },
    data: {
      completeQty,
      scrapQty,
      status: completed ? 'COMPLETED' : hasConfirmedActual ? 'RUNNING' : 'DRAFT',
      startTime: hasConfirmedActual ? order.startTime || new Date() : null,
      completeTime: completed ? order.completeTime || new Date() : null,
    },
  })
}
