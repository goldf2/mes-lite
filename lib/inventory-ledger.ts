import type { Prisma } from '@prisma/client'

const tolerance = 0.000001

export class InventoryLedgerError extends Error {}

export type InventoryReversalMovementInput = Omit<
  Prisma.StockLogUncheckedCreateInput,
  'id' | 'createdAt' | 'sourceMovementId' | 'reversalMovementId'
>

function isInverse(left: number | null, right: number | null | undefined) {
  return Math.abs(Number(left ?? 0) + Number(right ?? 0)) <= tolerance
}

export async function createInventoryReversalMovement(
  tx: Prisma.TransactionClient,
  sourceMovementId: string,
  input: InventoryReversalMovementInput,
) {
  const source = await tx.stockLog.findUnique({ where: { id: sourceMovementId } })
  if (!source) throw new InventoryLedgerError('原库存流水不存在，不能建立冲销关系')
  if (source.reversalMovementId) throw new InventoryLedgerError('原库存流水已经冲销，不能重复冲销')
  if (source.stockId !== input.stockId) throw new InventoryLedgerError('原流水与冲销流水的库存对象不一致')
  if (!isInverse(source.qty, input.qty)) throw new InventoryLedgerError('冲销数量与原流水不守恒')
  if (!isInverse(source.valuationQty, input.valuationQty)) throw new InventoryLedgerError('冲销核算数量与原流水不守恒')
  if (!isInverse(source.costAmount, input.costAmount)) throw new InventoryLedgerError('冲销成本金额与原流水不守恒')

  const reversal = await tx.stockLog.create({
    data: { ...input, sourceMovementId: source.id },
  })
  const linked = await tx.stockLog.updateMany({
    where: { id: source.id, reversalMovementId: null },
    data: { reversalMovementId: reversal.id },
  })
  if (linked.count !== 1) throw new InventoryLedgerError('原库存流水已经冲销，不能重复冲销')
  return reversal
}
