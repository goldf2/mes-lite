import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { employeeNamesSnapshot, resolveActiveEmployees } from '@/modules/configuration'
import type { CreateProductionOrderActualInput } from '../contracts/production-order-actual-schema'
import {
  buildProductionActualNo,
  parseProductionActualDate,
  parseProductionActualSequence,
  productionActualDayRange,
} from '../domain/production-order-actual-numbering'
import { parseProductionOrderBomSnapshot } from '../domain/production-order-bom-snapshot'
import { ProductionOrderDomainError } from '../domain/production-order-errors'
import { productionOrderActualCreationError } from '../domain/production-order-status'
import { buildProductionOrderActualLines } from './production-order-actual-lines'

const actualInclude = {
  employees: {
    include: { employee: { select: { id: true, code: true, name: true, department: true, isActive: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  inputs: {
    include: {
      material: { select: { id: true, code: true, name: true, category: true, stockUnit: true, unit: true } },
      location: { select: { id: true, code: true, name: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  outputs: {
    include: {
      material: { select: { id: true, code: true, name: true, category: true, stockUnit: true, unit: true } },
      location: { select: { id: true, code: true, name: true } },
      inventoryLot: {
        include: {
          balances: { orderBy: { createdAt: 'asc' as const } },
          inspections: { orderBy: { createdAt: 'desc' as const } },
        },
      },
    },
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.ProductionOrderActualInclude

export async function getProductionOrderActualWorkspace(orderId: string) {
  const [order, locations, employees] = await Promise.all([
    prisma.productionOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        targetMaterial: { select: { id: true, code: true, name: true, stockUnit: true, unit: true } },
        actuals: { include: actualInclude, orderBy: [{ actualDate: 'desc' }, { createdAt: 'desc' }] },
      },
    }),
    prisma.inventoryLocation.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, code: true, name: true, isDefault: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    }),
    prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, department: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    }),
  ])
  if (!order) throw new ProductionOrderDomainError('生产订单不存在或已归档', 404)
  return {
    order: { ...order, bomSnapshot: order.bomSnapshot ? parseProductionOrderBomSnapshot(order.bomSnapshot) : null },
    locations,
    employees,
  }
}

export async function createProductionOrderActual(orderId: string, input: CreateProductionOrderActualInput) {
  const actualDate = parseProductionActualDate(input.actualDate)
  return prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.findFirst({ where: { id: orderId, deletedAt: null } })
    if (!order) throw new ProductionOrderDomainError('生产订单不存在或已归档', 404)
    const creationError = productionOrderActualCreationError(order.status, order.materialId)
    if (creationError) throw new ProductionOrderDomainError(creationError)
    if (!order.bomSnapshot) throw new ProductionOrderDomainError('生产订单没有 BOM 快照，请重新创建生产订单')

    const employees = await resolveActiveEmployees(tx, input.employeeIds)
    const lines = await buildProductionOrderActualLines(tx, order.bomSnapshot, input.inputs, input.outputs)
    const { start, end } = productionActualDayRange(actualDate)
    const latestActual = await tx.productionOrderActual.findFirst({
      where: { actualDate: { gte: start, lt: end } },
      select: { actualNo: true },
      orderBy: { actualNo: 'desc' },
    })
    const previousSequence = latestActual ? parseProductionActualSequence(latestActual.actualNo, actualDate) : 0
    return tx.productionOrderActual.create({
      data: {
        actualNo: buildProductionActualNo(actualDate, previousSequence),
        orderId: order.id,
        actualDate,
        workers: employeeNamesSnapshot(employees),
        note: input.note || null,
        employees: { create: employees.map((employee) => ({ employeeId: employee.id, employeeCode: employee.code, employeeName: employee.name })) },
        inputs: { create: lines.inputs },
        outputs: { create: lines.outputs },
      },
      include: actualInclude,
    })
  })
}

export async function deleteProductionOrderActualDraft(orderId: string, actualId: string) {
  const actual = await prisma.productionOrderActual.findFirst({
    where: { id: actualId, orderId },
    include: { inputs: true, outputs: true },
  })
  if (!actual) throw new ProductionOrderDomainError('班后生产实绩不存在', 404)
  if (actual.status !== 'DRAFT') {
    throw new ProductionOrderDomainError('只有草稿实绩可以删除；已确认实绩请使用冲销')
  }
  await prisma.productionOrderActual.delete({ where: { id: actual.id } })
  return actual
}
