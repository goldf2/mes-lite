import { Prisma } from '@prisma/client'
import { nextConfigurationSortOrder } from '@/lib/configuration-order'
import { prisma } from '@/lib/prisma'
import type { InventoryLocationInput, InventoryLocationUpdateInput } from '../contracts/inventory-location-schema'
import { InventoryLocationDomainError } from '../domain/inventory-location-errors'
import {
  assertInventoryLocationUpdateAllowed,
  inventoryLocationHasStock,
  normalizeInventoryLocationCode,
  resolveNewInventoryLocationState,
} from '../domain/inventory-location-rules'

async function runInventoryLocationCommand<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof InventoryLocationDomainError) throw error
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new InventoryLocationDomainError('库位编码已存在', 409)
    }
    throw error
  }
}

export async function createManagedInventoryLocation(input: InventoryLocationInput) {
  return runInventoryLocationCommand(() => prisma.$transaction(async (tx) => {
    const hasActiveDefault = Boolean(await tx.inventoryLocation.findFirst({
      where: { isDefault: true, isActive: true, deletedAt: null },
      select: { id: true },
    }))
    const state = resolveNewInventoryLocationState(input, hasActiveDefault)
    if (state.isDefault) await tx.inventoryLocation.updateMany({ data: { isDefault: false } })
    return tx.inventoryLocation.create({
      data: {
        code: normalizeInventoryLocationCode(input.code),
        name: input.name.trim(),
        note: input.note?.trim() || null,
        ...state,
        sortOrder: await nextConfigurationSortOrder(tx, 'locations'),
      },
    })
  }))
}

export async function updateManagedInventoryLocation(input: InventoryLocationUpdateInput) {
  return runInventoryLocationCommand(() => prisma.$transaction(async (tx) => {
    const existing = await tx.inventoryLocation.findUnique({ where: { id: input.id } })
    if (!existing) throw new InventoryLocationDomainError('库位不存在', 404)
    assertInventoryLocationUpdateAllowed(existing, input)
    if (input.isDefault === true) await tx.inventoryLocation.updateMany({ data: { isDefault: false } })
    const saved = await tx.inventoryLocation.update({
      where: { id: input.id },
      data: {
        ...(input.code === undefined ? {} : { code: normalizeInventoryLocationCode(input.code) }),
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(input.note === undefined ? {} : { note: input.note?.trim() || null }),
        ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
        ...(input.isDefault === true ? { isActive: true, deletedAt: null } : (
          input.isActive === undefined ? {} : {
            isActive: input.isActive,
            deletedAt: input.isActive ? null : existing.deletedAt,
          }
        )),
      },
    })
    return { existing, saved }
  }))
}

async function countPendingInventoryLocationReferences(tx: Prisma.TransactionClient, id: string) {
  const [pendingReceipts, draftReports, draftTransfers, pendingShipments, pendingReturns] = await Promise.all([
    tx.materialIn.count({ where: { locationId: id, status: 'PENDING', deletedAt: null } }),
    tx.dailyProductionReport.count({ where: { status: 'DRAFT', OR: [{ consumptionLocationId: id }, { outputLocationId: id }] } }),
    tx.flowTransfer.count({ where: { status: 'DRAFT', OR: [{ sourceLocationId: id }, { targetLocationId: id }] } }),
    tx.shipment.count({ where: { locationId: id, status: 'PENDING', deletedAt: null } }),
    tx.returnOrder.count({ where: { locationId: id, status: 'PENDING', deletedAt: null } }),
  ])
  return pendingReceipts + draftReports + draftTransfers + pendingShipments + pendingReturns
}

export async function archiveManagedInventoryLocation(id: string, archivedAt = new Date()) {
  return runInventoryLocationCommand(() => prisma.$transaction(async (tx) => {
    const existing = await tx.inventoryLocation.findUnique({
      where: { id }, include: { balances: true },
    })
    if (!existing) throw new InventoryLocationDomainError('库位不存在', 404)
    if (existing.isDefault) throw new InventoryLocationDomainError('默认库位不能归档，请先设置其他默认库位')
    if (inventoryLocationHasStock(existing.balances)) {
      throw new InventoryLocationDomainError('该库位仍有库存或占用数量，不能归档', 409)
    }
    if (await countPendingInventoryLocationReferences(tx, id) > 0) {
      throw new InventoryLocationDomainError('该库位仍被待处理的来料、生产、转移、发货或退货单引用，不能归档', 409)
    }
    const saved = await tx.inventoryLocation.update({
      where: { id }, data: { isActive: false, deletedAt: archivedAt },
    })
    return { existing, saved }
  }))
}
