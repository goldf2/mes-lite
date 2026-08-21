import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { DispatchDomainError } from '../domain/dispatch-errors'
import { assertDispatchDataScope, dispatchDataScopeWhere, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import { tokenizeKeywordQuery, type ResourceSearchCondition } from '@/lib/resource-search'
import { dispatchPriorityLabels, dispatchStatusOptions } from '../contracts/dispatch'

export const dispatchDetailInclude = {
  order: {
    include: {
      product: {
        select: {
          id: true, name: true, sku: true, customerId: true,
          customer: { select: { id: true, code: true, name: true } },
        },
      },
      targetMaterial: {
        select: {
          id: true, name: true, code: true, category: true, customerId: true,
          customer: { select: { id: true, code: true, name: true } }, unit: true, stockUnit: true,
        },
      },
    },
  },
  step: { include: { workCenter: { select: { id: true, code: true, name: true } } } },
  employee: { select: { id: true, code: true, name: true, department: true } },
} satisfies Prisma.DispatchInclude

export interface DispatchListInput {
  statuses: string[]
  workerName?: string | null
  orderId?: string | null
  customerId?: string | null
  keyword?: string | null
  advancedConditions?: ResourceSearchCondition[]
  page: number
  pageSize: number
}
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
export async function listManagedDispatches(input: DispatchListInput, scope: EffectiveDataScope = unrestrictedDataScope) {
  const where: Prisma.DispatchWhereInput = { deletedAt: null, ...dispatchDataScopeWhere(scope) }
  const andConditions: Prisma.DispatchWhereInput[] = []
  if (input.statuses.length === 1) where.status = input.statuses[0]
  if (input.statuses.length > 1) where.status = { in: input.statuses }
  if (input.workerName) where.workerName = { contains: input.workerName }
  if (input.orderId) where.orderId = input.orderId
  if (input.customerId) {
    const customerId = input.customerId === '__UNASSIGNED__' ? null : input.customerId
    where.order = {
      is: {
        OR: [
          { product: { is: { customerId } } },
          { targetMaterial: { is: { customerId } } },
        ],
      },
    }
  }
  for (const condition of input.advancedConditions || []) {
    const text = stringFilter(condition)
    if (condition.field === 'dispatchNo' || condition.field === 'voucherNo' || condition.field === 'note') andConditions.push({ [condition.field]: text } as Prisma.DispatchWhereInput)
    else if (condition.field === 'status' || condition.field === 'priority') andConditions.push({ [condition.field]: condition.value } as Prisma.DispatchWhereInput)
    else if (condition.field === 'customerId') {
      const customerId = condition.value === '__UNASSIGNED__' ? null : condition.value
      andConditions.push({ order: { is: { OR: [{ product: { is: { customerId } } }, { targetMaterial: { is: { customerId } } }] } } })
    } else if (condition.field === 'order') andConditions.push({ order: { is: { orderNo: text } } })
    else if (condition.field === 'material') andConditions.push({ order: { is: { OR: [{ product: { is: { OR: [{ sku: text }, { name: text }] } } }, { targetMaterial: { is: { OR: [{ code: text }, { name: text }] } } }] } } })
    else if (condition.field === 'step') andConditions.push({ step: { is: { name: text } } })
    else if (condition.field === 'workCenter') andConditions.push({ step: { is: { OR: [{ workstation: text }, { workCenter: { is: { OR: [{ code: text }, { name: text }] } } }] } } })
    else if (condition.field === 'employee') andConditions.push({ OR: [{ employeeId: condition.value }, { workerName: text }, { employee: { is: { OR: [{ code: text }, { name: text }, { department: text }] } } }] })
    else if (condition.field === 'planQty') {
      const value = numberFilter(condition)
      if (value) andConditions.push({ planQty: value })
    } else if (condition.field === 'createdAt') {
      const value = dateFilter(condition)
      if (value) andConditions.push({ createdAt: value })
    }
  }
  andConditions.push(...tokenizeKeywordQuery(input.keyword || '').map((token): Prisma.DispatchWhereInput => {
    const number = Number(token)
    const date = /^\d{4}-\d{2}-\d{2}$/.test(token) ? new Date(`${token}T00:00:00+08:00`) : null
    return { OR: [
    { dispatchNo: { contains: token } }, { voucherNo: { contains: token } }, { workerName: { contains: token } }, { note: { contains: token } },
    { order: { is: { orderNo: { contains: token } } } },
    { order: { is: { product: { is: { OR: [{ sku: { contains: token } }, { name: { contains: token } }] } } } } },
    { order: { is: { targetMaterial: { is: { OR: [{ code: { contains: token } }, { name: { contains: token } }] } } } } },
    { step: { is: { name: { contains: token } } } }, { step: { is: { workstation: { contains: token } } } },
    { step: { is: { workCenter: { is: { OR: [{ code: { contains: token } }, { name: { contains: token } }] } } } } },
    { employee: { is: { OR: [{ code: { contains: token } }, { name: { contains: token } }, { department: { contains: token } }] } } },
    ...dispatchStatusOptions.filter((option) => option.label.toLocaleLowerCase('zh-CN').includes(token)).map((option) => ({ status: option.value })),
    ...Object.entries(dispatchPriorityLabels).filter(([, label]) => label.includes(token)).map(([priority]) => ({ priority })),
    ...(Number.isFinite(number) ? [{ planQty: number }] : []),
    ...(date && !Number.isNaN(date.getTime()) ? [{ createdAt: { gte: date, lt: new Date(date.getTime() + 86_400_000) } }] : []),
  ] }
  }))
  if (andConditions.length > 0) where.AND = andConditions
  const page = Math.max(1, input.page)
  const pageSize = Math.min(100, Math.max(1, input.pageSize))
  const [items, total] = await Promise.all([
    prisma.dispatch.findMany({
      where, include: dispatchDetailInclude, orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize, take: pageSize,
    }),
    prisma.dispatch.count({ where }),
  ])
  return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }
}

export async function getManagedDispatch(id: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  const dispatch = await prisma.dispatch.findUnique({ where: { id }, include: dispatchDetailInclude })
  if (!dispatch || dispatch.deletedAt) throw new DispatchDomainError('派工单不存在或已归档', 404)
  assertDispatchDataScope(scope, dispatch)
  return dispatch
}

export async function listManagedDispatchEmployees(scope: EffectiveDataScope) {
  return prisma.employee.findMany({
    where: {
      isActive: true,
      ...(scope.productionMode === 'SELF' ? { id: scope.employeeId ?? '__NO_AUTHORIZED_SCOPE__' } : {}),
    },
    select: { id: true, code: true, name: true, department: true },
    orderBy: [{ code: 'asc' }],
  })
}
