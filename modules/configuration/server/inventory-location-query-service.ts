import { prisma } from '@/lib/prisma'

export async function listManagedInventoryLocations(includeInactive = false) {
  const locations = await prisma.inventoryLocation.findMany({
    where: includeInactive ? {} : { isActive: true, deletedAt: null },
    include: { balances: { select: { qty: true, reservedQty: true, availableQty: true } } },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  })
  return locations.map(({ balances, ...location }) => ({
    ...location,
    materialCount: balances.length,
    qty: balances.reduce((sum, item) => sum + Number(item.qty), 0),
    reservedQty: balances.reduce((sum, item) => sum + Number(item.reservedQty), 0),
    availableQty: balances.reduce((sum, item) => sum + Number(item.availableQty), 0),
  }))
}
