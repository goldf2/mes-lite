import type { Prisma } from '@prisma/client'
import { withMaterialImageUrls } from '@/lib/attachment-urls'
import { prisma } from '@/lib/prisma'
import { tokenizeKeywordQuery } from '@/lib/resource-search'
import { flowTransferDataScopeWhere, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'

export const flowTransferInclude = {
  material: { select: { id: true, code: true, name: true, spec: true, category: true, stockUnit: true, unit: true } },
  sourceLocation: { select: { id: true, code: true, name: true } },
  targetLocation: { select: { id: true, code: true, name: true } },
  employee: { select: { id: true, code: true, name: true, department: true, isActive: true } },
} satisfies Prisma.FlowTransferInclude

export async function loadManagedFlowTransferWorkspace(input: { keyword?: string | null; status?: string | null }, scope: EffectiveDataScope = unrestrictedDataScope) {
  const where: Prisma.FlowTransferWhereInput = flowTransferDataScopeWhere(scope)
  if (input.status && input.status !== 'ALL') where.status = input.status
  const keywordFilters = tokenizeKeywordQuery(input.keyword?.trim() || '').map((token) => ({ OR: [
    { transferNo: { contains: token } },
    { operator: { contains: token } },
    { note: { contains: token } },
    { material: { is: { code: { contains: token } } } },
    { material: { is: { name: { contains: token } } } },
  ] }))
  if (keywordFilters.length > 0) where.AND = keywordFilters

  const [transfers, materials, locations, employees] = await Promise.all([
    prisma.flowTransfer.findMany({
      where, include: flowTransferInclude,
      orderBy: [{ transferDate: 'desc' }, { createdAt: 'desc' }], take: 300,
    }),
    prisma.material.findMany({
      where: { deletedAt: null },
      select: {
        id: true, code: true, name: true, spec: true, category: true, stockUnit: true, unit: true,
        stock: { select: { qty: true, availableQty: true, locationBalances: {
          where: scope.inventoryMode === 'LOCATIONS' ? { locationId: { in: scope.locationIds } } : undefined,
          select: { locationId: true, qty: true, reservedQty: true, availableQty: true },
        } } },
      },
      orderBy: [{ category: 'asc' }, { code: 'asc' }], take: 1000,
    }),
    prisma.inventoryLocation.findMany({
      where: { isActive: true, deletedAt: null, ...(scope.inventoryMode === 'LOCATIONS' ? { id: { in: scope.locationIds } } : {}) },
      select: { id: true, code: true, name: true, isDefault: true },
      orderBy: [{ isDefault: 'desc' }, { code: 'asc' }],
    }),
    prisma.employee.findMany({
      where: { isActive: true }, select: { id: true, code: true, name: true, department: true },
      orderBy: [{ code: 'asc' }],
    }),
  ])
  const materialIds = materials.map((material) => material.id)
  const images = materialIds.length === 0 ? [] : await prisma.documentAttachment.findMany({
    where: {
      ownerType: 'MATERIAL', ownerId: { in: materialIds }, documentType: 'MATERIAL_IMAGE',
      mimeType: { startsWith: 'image/' }, deletedAt: null,
    },
    orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, ownerId: true, note: true, mimeType: true, isCover: true, size: true, rotation: true },
  })
  const primaryImageByMaterial = new Map<string, (typeof images)[number]>()
  for (const image of images) if (!primaryImageByMaterial.has(image.ownerId)) primaryImageByMaterial.set(image.ownerId, image)
  return {
    transfers,
    materials: materials.map((material) => {
      const image = primaryImageByMaterial.get(material.id)
      const locationBalances = material.stock?.locationBalances || []
      return {
        ...material,
        stock: material.stock ? {
          ...material.stock,
          ...(scope.inventoryMode === 'LOCATIONS' ? {
            qty: locationBalances.reduce((total, balance) => total + Number(balance.qty), 0),
            availableQty: locationBalances.reduce((total, balance) => total + Number(balance.availableQty), 0),
          } : {}),
        } : null,
        primaryImage: image ? withMaterialImageUrls(image) : null,
      }
    }),
    locations,
    employees,
  }
}
