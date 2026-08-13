import { prisma } from '@/lib/prisma'
import { nextConfigurationSortOrder } from '@/modules/configuration'
import { resolveMaterialIdForProduct, resolveProductId } from '@/lib/material-product'
import type { ProcessRouteInput, ProcessStepInput, ProcessTemplateInput } from '../contracts/production-engineering-schema'

const templateInclude = { materials: { select: { id: true, code: true, name: true } } } as const
const routeInclude = {
  product: { select: { id: true, sku: true, name: true } },
  steps: { where: { deletedAt: null }, include: { workCenter: { select: { id: true, code: true, name: true } } }, orderBy: { stepNo: 'asc' as const } },
} as const

export class ProductionEngineeringNotFoundError extends Error {
  constructor(public readonly resource: 'template' | 'route' | 'material') {
    super(resource === 'template' ? '加工工艺模板不存在' : resource === 'route' ? '工艺路线不存在' : '物料不存在')
  }
}

function templateData(data: ProcessTemplateInput) {
  return {
    code: data.code,
    name: data.name,
    category: data.category,
    defaultTime: data.defaultTime ?? null,
    workstation: data.workstation || null,
    description: data.description || null,
    standardBatchQty: data.standardBatchQty,
    setupTimeMinutes: data.setupTimeMinutes,
    cycleTimeSeconds: data.cycleTimeSeconds,
    peopleCount: data.peopleCount,
    laborRatePerHour: data.laborRatePerHour,
    machineCount: data.machineCount,
    machineRatePerHour: data.machineRatePerHour,
    energyCostPerHour: data.energyCostPerHour,
    consumableCostPerBatch: data.consumableCostPerBatch,
    yieldRate: data.yieldRate,
  }
}

function stepData(step: ProcessStepInput) {
  return {
    stepNo: step.stepNo, name: step.name, defaultTime: step.defaultTime ?? null, workstation: step.workstation || null, workCenterId: step.workCenterId || null, description: step.description || null,
    templateId: step.templateId || null, templateCode: step.templateCode || null, standardBatchQty: step.standardBatchQty, setupTimeMinutes: step.setupTimeMinutes,
    cycleTimeSeconds: step.cycleTimeSeconds, peopleCount: step.peopleCount, laborRatePerHour: step.laborRatePerHour, machineCount: step.machineCount,
    machineRatePerHour: step.machineRatePerHour, energyCostPerHour: step.energyCostPerHour, consumableCostPerBatch: step.consumableCostPerBatch, yieldRate: step.yieldRate,
  }
}

export async function listProcessTemplates() {
  return prisma.processTemplate.findMany({ include: templateInclude, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] })
}

export async function createProcessTemplate(data: ProcessTemplateInput) {
  return prisma.$transaction(async (tx) => tx.processTemplate.create({
    data: {
      ...templateData(data),
      sortOrder: await nextConfigurationSortOrder(tx, 'processTemplates'),
      materials: { connect: data.materialIds.map((id) => ({ id })) },
    },
    include: templateInclude,
  }))
}

export async function updateProcessTemplate(id: string, data: ProcessTemplateInput) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.processTemplate.findUnique({ where: { id }, include: templateInclude })
    if (!before) throw new ProductionEngineeringNotFoundError('template')
    const template = await tx.processTemplate.update({
      where: { id },
      data: { ...templateData(data), materials: { set: data.materialIds.map((materialId) => ({ id: materialId })) } },
      include: templateInclude,
    })
    return { before, template }
  })
}

export async function listProcessRoutes() {
  return prisma.processRoute.findMany({ include: routeInclude, orderBy: [{ sortOrder: 'asc' }, { product: { sku: 'asc' } }] })
}

export async function createProcessRoute(data: ProcessRouteInput) {
  return prisma.$transaction(async (tx) => {
    const productId = await resolveProductId(tx, data.productId, { description: '由物料自动映射，用于工艺路线兼容。' })
    const product = await tx.product.findUnique({ where: { id: productId } })
    if (!product) throw new ProductionEngineeringNotFoundError('material')
    const materialId = await resolveMaterialIdForProduct(tx, data.productId, product.materialId)
    if (!materialId) throw new ProductionEngineeringNotFoundError('material')
    await assertProcessWorkCenters(tx, data.steps)
    if (data.isDefault) await tx.processRoute.updateMany({ where: { productId, isDefault: true }, data: { isDefault: false } })
    const route = await tx.processRoute.create({
      data: {
        productId,
        materialId,
        name: data.name,
        isDefault: Boolean(data.isDefault),
        sortOrder: await nextConfigurationSortOrder(tx, 'processRoutes'),
        steps: { create: data.steps.map(stepData) },
      },
      include: routeInclude,
    })
    return { product, route }
  })
}

export async function updateProcessRoute(id: string, data: ProcessRouteInput) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.processRoute.findUnique({ where: { id }, include: { product: true, steps: { orderBy: { stepNo: 'asc' } } } })
    if (!before) throw new ProductionEngineeringNotFoundError('route')
    const productId = await resolveProductId(tx, data.productId, { description: '由物料自动映射，用于工艺路线兼容。' })
    const product = await tx.product.findUnique({ where: { id: productId } })
    if (!product) throw new ProductionEngineeringNotFoundError('material')
    const materialId = await resolveMaterialIdForProduct(tx, data.productId, product.materialId)
    if (!materialId) throw new ProductionEngineeringNotFoundError('material')
    await assertProcessWorkCenters(tx, data.steps)
    if (data.isDefault) await tx.processRoute.updateMany({ where: { productId, isDefault: true, id: { not: id } }, data: { isDefault: false } })
    await tx.processStep.updateMany({ where: { routeId: id, deletedAt: null }, data: { deletedAt: new Date() } })
    const route = await tx.processRoute.update({
      where: { id },
      data: { productId, materialId, name: data.name, isDefault: Boolean(data.isDefault), steps: { create: data.steps.map(stepData) } },
      include: routeInclude,
    })
    return { before, product, route }
  })
}

async function assertProcessWorkCenters(tx: import('@prisma/client').Prisma.TransactionClient, steps: ProcessStepInput[]) {
  const ids = Array.from(new Set(steps.flatMap((step) => step.workCenterId ? [step.workCenterId] : [])))
  if (ids.length === 0) return
  const count = await tx.workCenter.count({ where: { id: { in: ids }, isActive: true, deletedAt: null } })
  if (count !== ids.length) throw new ProductionEngineeringNotFoundError('route')
}
