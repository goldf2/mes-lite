import type { Prisma } from '@prisma/client'
import { withMaterialImageUrls } from '@/lib/attachment-urls'
import { prisma } from '@/lib/prisma'
import { tokenizeKeywordQuery, type ResourceSearchCondition } from '@/lib/resource-search'
import { flowTransferDataScopeWhere, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'

export const flowTransferInclude = {
  material: { select: { id: true, code: true, name: true, spec: true, category: true, stockUnit: true, unit: true } },
  sourceLocation: { select: { id: true, code: true, name: true } },
  targetLocation: { select: { id: true, code: true, name: true } },
  employee: { select: { id: true, code: true, name: true, department: true, isActive: true } },
} satisfies Prisma.FlowTransferInclude

function stringFilter(condition: ResourceSearchCondition) {
  return condition.operator === 'equals' ? { equals: condition.value } : condition.operator === 'startsWith' ? { startsWith: condition.value } : { contains: condition.value }
}
function numberFilter(condition: ResourceSearchCondition) {
  const value = Number(condition.value)
  if (!Number.isFinite(value)) return undefined
  return condition.operator === 'gt' ? { gt: value } : condition.operator === 'gte' ? { gte: value } : condition.operator === 'lt' ? { lt: value } : condition.operator === 'lte' ? { lte: value } : { equals: value }
}
function dateFilter(condition: ResourceSearchCondition) {
  const start = new Date(`${condition.value}T00:00:00+08:00`)
  if (Number.isNaN(start.getTime())) return undefined
  if (condition.operator === 'gt') return { gt: new Date(start.getTime() + 86_400_000) }
  if (condition.operator === 'gte') return { gte: start }
  if (condition.operator === 'lt') return { lt: start }
  if (condition.operator === 'lte') return { lt: new Date(start.getTime() + 86_400_000) }
  return { gte: start, lt: new Date(start.getTime() + 86_400_000) }
}

export async function loadManagedFlowTransferWorkspace(input: { keyword?: string | null; status?: string | null; advancedConditions?: ResourceSearchCondition[] }, scope: EffectiveDataScope = unrestrictedDataScope) {
  const where: Prisma.FlowTransferWhereInput = flowTransferDataScopeWhere(scope)
  if (input.status && input.status !== 'ALL') where.status = input.status
  const advancedFilters: Prisma.FlowTransferWhereInput[] = []
  for (const condition of input.advancedConditions || []) {
    const text = stringFilter(condition)
    if (['transferNo', 'unit', 'operator', 'note', 'confirmedBy', 'reversedBy', 'reverseReason'].includes(condition.field)) advancedFilters.push({ [condition.field]: text } as Prisma.FlowTransferWhereInput)
    else if (condition.field === 'status') advancedFilters.push({ status: condition.value })
    else if (condition.field === 'material') advancedFilters.push({ material: { is: { OR: [{ code: text }, { name: text }, { spec: text }] } } })
    else if (condition.field === 'sourceLocationId' || condition.field === 'targetLocationId' || condition.field === 'employeeId') advancedFilters.push({ [condition.field]: condition.value } as Prisma.FlowTransferWhereInput)
    else if (condition.field === 'quantity') {
      const value = numberFilter(condition)
      if (value) advancedFilters.push({ quantity: value })
    } else if (condition.field === 'transferDate') {
      const value = dateFilter(condition)
      if (value) advancedFilters.push({ transferDate: value })
    }
  }
  const keywordFilters = tokenizeKeywordQuery(input.keyword?.trim() || '').map((token) => {
    const number = Number(token)
    const date = /^\d{4}-\d{2}-\d{2}$/.test(token) ? new Date(`${token}T00:00:00+08:00`) : null
    return { OR: [
    { transferNo: { contains: token } },
    { operator: { contains: token } },
    { note: { contains: token } },
    { material: { is: { code: { contains: token } } } },
    { material: { is: { name: { contains: token } } } },
    { material: { is: { spec: { contains: token } } } },
    { sourceLocation: { is: { OR: [{ code: { contains: token } }, { name: { contains: token } }] } } },
    { targetLocation: { is: { OR: [{ code: { contains: token } }, { name: { contains: token } }] } } },
    { employee: { is: { OR: [{ code: { contains: token } }, { name: { contains: token } }, { department: { contains: token } }] } } },
    { confirmedBy: { contains: token } }, { reversedBy: { contains: token } }, { reverseReason: { contains: token } },
    ...[{ value: 'DRAFT', label: '草稿' }, { value: 'CONFIRMED', label: '已确认' }, { value: 'REVERSED', label: '已冲销' }].filter((option) => option.label.includes(token)).map((option) => ({ status: option.value })),
    ...(Number.isFinite(number) ? [{ quantity: number }] : []),
    ...(date && !Number.isNaN(date.getTime()) ? [{ transferDate: { gte: date, lt: new Date(date.getTime() + 86_400_000) } }] : []),
  ] }
  })
  if (keywordFilters.length > 0 || advancedFilters.length > 0) where.AND = [...advancedFilters, ...keywordFilters]

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
