import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ensureProductForMaterial, isMaterialProductId, materialProductPrefix } from '@/lib/material-product'
import type { CreateProductionOrderInput, ProductionOrderLineInput } from '../contracts/production-order-schema'
import { ProductionOrderDomainError } from '../domain/production-order-errors'
import { buildProductionOrderGroupNo, buildProductionOrderNo } from '../domain/production-order-numbering'

async function resolveOrderLine(tx: Prisma.TransactionClient, input: ProductionOrderLineInput) {
  const targetId = isMaterialProductId(input.targetId)
    ? input.targetId.slice(materialProductPrefix.length)
    : input.targetId
  const material = await tx.material.findUnique({
    where: { id: targetId },
    select: { id: true, code: true, name: true, category: true, customerId: true, stockUnit: true, unit: true, deletedAt: true },
  })
  if (!material || material.deletedAt) throw new ProductionOrderDomainError('物料不存在或已归档')

  const productId = await ensureProductForMaterial(tx, material, {
    defaultRoute: true,
    description: `由物料 ${material.code} 自动映射，用于简易生产工单。`,
  })
  const bom = await tx.bOM.findFirst({
    where: { id: input.bomId, productId, status: 'RELEASED' },
    select: {
      id: true,
      name: true,
      version: true,
      outputQuantity: true,
      outputUnit: true,
      outputs: {
        orderBy: { isPrimary: 'desc' },
        select: {
          id: true, materialId: true, quantity: true, unit: true, isPrimary: true,
          material: { select: { code: true, name: true, stockUnit: true, unit: true } },
        },
      },
      items: {
        where: { itemType: 'MATERIAL', materialId: { not: null } },
        select: {
          id: true, materialId: true, outputMaterialId: true, quantity: true, unit: true,
          material: { select: { code: true, name: true, stockUnit: true, unit: true } },
        },
      },
    },
  })
  if (!bom || bom.outputs.length === 0 || bom.items.length === 0) {
    throw new ProductionOrderDomainError(`物料 ${material.code} 缺少已发布且结构完整的 BOM`)
  }
  if (bom.outputs.filter((output) => output.isPrimary).length !== 1) {
    throw new ProductionOrderDomainError(`物料 ${material.code} 的 BOM 必须且只能有一项主产出`)
  }
  return { material, productId, bom, planQty: input.planQty }
}

function requestedLines(input: CreateProductionOrderInput): ProductionOrderLineInput[] {
  if (input.items?.length) return input.items
  return [{
    targetId: (input.targetId ?? input.materialId ?? input.productId)!,
    bomId: input.bomId!,
    planQty: input.planQty!,
  }]
}

export async function createProductionOrders(input: CreateProductionOrderInput, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const dayStart = new Date(now)
    dayStart.setHours(0, 0, 0, 0)
    const existingOrderCount = await tx.productionOrder.count({ where: { createdAt: { gte: dayStart } } })
    const groupNo = buildProductionOrderGroupNo(now, existingOrderCount)

    const resolvedLines = []
    for (const line of requestedLines(input)) resolvedLines.push(await resolveOrderLine(tx, line))

    const items = []
    for (let index = 0; index < resolvedLines.length; index += 1) {
      const line = resolvedLines[index]
      items.push(await tx.productionOrder.create({
        data: {
          orderNo: buildProductionOrderNo(groupNo, index),
          groupNo: resolvedLines.length > 1 ? groupNo : null,
          lineNo: index + 1,
          voucherNo: input.voucherNo?.trim() || null,
          productId: line.productId,
          materialId: line.material.id,
          bomId: line.bom.id,
          bomName: line.bom.name,
          bomVersion: line.bom.version,
          bomSnapshot: JSON.stringify(line.bom),
          planQty: line.planQty,
          status: 'DRAFT',
          note: input.note,
        },
      }))
    }
    return { first: items[0], items, groupNo: items.length > 1 ? groupNo : null }
  })
}

export async function archiveProductionOrder(id: string) {
  const current = await prisma.productionOrder.findUnique({ where: { id } })
  if (!current || current.deletedAt) throw new ProductionOrderDomainError('生产订单不存在或已归档', 404)
  const updated = await prisma.productionOrder.update({ where: { id }, data: { deletedAt: new Date() } })
  return { current, updated }
}
