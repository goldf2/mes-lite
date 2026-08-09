import { materialAsProductOption } from '@/lib/material-product'
import { prisma } from '@/lib/prisma'

export async function listProductCompatibleMaterials(customerId?: string | null) {
  const materials = await prisma.material.findMany({
    where: {
      deletedAt: null,
      ...(customerId === '__UNASSIGNED__' ? { customerId: null } : customerId ? { customerId } : {}),
    },
    select: {
      id: true, code: true, name: true, category: true, customerId: true,
      customer: { select: { id: true, code: true, name: true } }, spec: true, unit: true, stockUnit: true,
      stock: {
        select: {
          qty: true, availableQty: true,
          locationBalances: { select: { locationId: true, qty: true, availableQty: true, location: { select: { code: true, name: true, isActive: true, deletedAt: true } } } },
        },
      },
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  return materials.map(materialAsProductOption)
}
