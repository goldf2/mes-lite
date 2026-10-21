import type { Prisma } from '@prisma/client'

const tolerance = 0.000001
const round = (value: number) => Number(value.toFixed(6))

type PackedFilter = {
  materialId?: string
  inventoryLotId?: string
  locationId?: string
  inventoryStatus?: string
  excludePackageDocumentIds?: string[]
}

// These are assignments of the existing lot balance, never a second inventory balance.
export async function listPackedInventoryItems(tx: Prisma.TransactionClient, filter: PackedFilter) {
  return tx.packageDocumentItem.findMany({
    where: {
      materialId: filter.materialId,
      inventoryLotId: filter.inventoryLotId,
      inventoryStatus: filter.inventoryStatus === 'ANY' ? undefined : filter.inventoryStatus || 'AVAILABLE',
      packageDocument: { is: {
        sourceType: 'WAREHOUSE', status: 'PACKED', deletedAt: null,
        ...(filter.excludePackageDocumentIds?.length ? { id: { notIn: filter.excludePackageDocumentIds } } : {}),
        placement: { is: filter.locationId ? { locationId: filter.locationId } : {} },
      } },
    },
    select: { id: true, packageDocumentId: true, inventoryLotId: true, quantity: true },
  })
}

export async function getPackedInventoryQuantity(tx: Prisma.TransactionClient, filter: PackedFilter) {
  const rows = await listPackedInventoryItems(tx, filter)
  return round(rows.reduce((sum, item) => sum + Number(item.quantity), 0))
}

export type WarehouseLotPlan = Array<{ lotId: string; stockQty: number }>

// A selected box consumes its exact lot. Only the remainder may use loose FIFO stock.
export async function planWarehouseIssueLots(tx: Prisma.TransactionClient, input: {
  materialId: string
  locationId: string
  stockQty: number
  packageDocumentIds?: string[]
  shipmentId?: string
  allowLooseShortage?: boolean
  looseStockLimit?: number
}): Promise<WarehouseLotPlan | undefined> {
  const allAssignments = await listPackedInventoryItems(tx, { materialId: input.materialId })
  const selectedIds = input.packageDocumentIds || []
  if (!allAssignments.length && !selectedIds.length) return undefined
  if (new Set(selectedIds).size !== selectedIds.length) throw new Error('同一货箱不能重复出库')
  const selected = selectedIds.length ? await tx.packageDocument.findMany({
    where: { id: { in: selectedIds }, sourceType: 'WAREHOUSE', status: 'PACKED', deletedAt: null },
    include: { items: true, placement: true, allocations: { where: { status: 'RESERVED' } } },
  }) : []
  if (selected.length !== selectedIds.length) throw new Error('所选货箱已发货、作废或不存在')
  const planned = new Map<string, number>()
  let selectedQty = 0
  for (const box of selected) {
    if (!input.shipmentId || box.allocations.length !== 1 || box.allocations[0].shipmentId !== input.shipmentId
      || box.allocations[0].contentVersion !== box.contentVersion || box.placement?.locationId !== input.locationId) {
      throw new Error(`货箱 ${box.packageNo} 的发货占用、内容版本或库位已变化`)
    }
    for (const item of box.items) {
      if (item.materialId !== input.materialId || !item.inventoryLotId || item.inventoryStatus !== 'AVAILABLE') {
        throw new Error(`货箱 ${box.packageNo} 的产品或实际可用批次无效`)
      }
      planned.set(item.inventoryLotId, round((planned.get(item.inventoryLotId) || 0) + Number(item.quantity)))
      selectedQty = round(selectedQty + Number(item.quantity))
    }
  }
  let remaining = round(input.stockQty - selectedQty)
  if (remaining < -tolerance) throw new Error('发货数量小于所选货箱数量')
  if (input.looseStockLimit != null && remaining > input.looseStockLimit + tolerance) {
    if (!input.allowLooseShortage) throw new Error('未装箱可用库存不足，不能消耗已装箱或已预留库存')
    remaining = Math.max(0, round(input.looseStockLimit))
  }
  const assignments = await listPackedInventoryItems(tx, { materialId: input.materialId, locationId: input.locationId })
  const packedByLot = new Map<string, number>()
  for (const item of assignments) if (item.inventoryLotId) {
    packedByLot.set(item.inventoryLotId, round((packedByLot.get(item.inventoryLotId) || 0) + Number(item.quantity)))
  }
  const balances = await tx.inventoryLotBalance.findMany({
    where: { locationId: input.locationId, inventoryStatus: 'AVAILABLE', stockQty: { gt: tolerance }, lot: { materialId: input.materialId, status: 'OPEN' } },
    include: { lot: true }, orderBy: [{ lot: { receivedAt: 'asc' } }, { createdAt: 'asc' }],
  })
  for (const [lotId, quantity] of Array.from(planned)) {
    const balance = balances.find((item) => item.lotId === lotId)
    if (!balance || Number(balance.stockQty) + tolerance < quantity || Number(balance.stockQty) + tolerance < (packedByLot.get(lotId) || 0)) {
      throw new Error('货箱对应的真实批次库存不足或已被质检冻结')
    }
  }
  for (const balance of balances) {
    if (remaining <= tolerance) break
    const looseQty = Math.max(0, round(Number(balance.stockQty) - (packedByLot.get(balance.lotId) || 0)))
    const quantity = round(Math.min(looseQty, remaining))
    if (quantity <= tolerance) continue
    planned.set(balance.lotId, round((planned.get(balance.lotId) || 0) + quantity))
    remaining = round(remaining - quantity)
  }
  if (remaining > tolerance && !input.allowLooseShortage) throw new Error(`散货可用量不足，尚缺 ${remaining}；已装箱库存需选箱发货或先作废装箱记录`)
  return Array.from(planned).map(([lotId, stockQty]) => ({ lotId, stockQty }))
}
