import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { DispatchDomainError } from '../domain/dispatch-errors'

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
  step: true,
} satisfies Prisma.DispatchInclude

export interface DispatchListInput {
  statuses: string[]
  workerName?: string | null
  orderId?: string | null
  customerId?: string | null
  page: number
  pageSize: number
}
export async function listManagedDispatches(input: DispatchListInput) {
  const where: Prisma.DispatchWhereInput = { deletedAt: null }
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

export async function getManagedDispatch(id: string) {
  const dispatch = await prisma.dispatch.findUnique({ where: { id }, include: dispatchDetailInclude })
  if (!dispatch || dispatch.deletedAt) throw new DispatchDomainError('派工单不存在或已归档', 404)
  return dispatch
}
