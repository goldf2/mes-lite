import { prisma } from '@/lib/prisma'
import type { LegacyProductionOrderReportInput } from '../contracts/legacy-production-order-execution-schema'
import {
  areAllProductionStepsReported,
  incompletePreviousStepError,
  legacyOrderStatusAfterReport,
  legacyProductionCompatibilityError,
  legacyReportStatusError,
} from '../domain/legacy-production-order-execution-rules'
import { ProductionOrderDomainError } from '../domain/production-order-errors'
import {
  assertProductionOrderIdDataScope,
  type EffectiveDataScope,
  unrestrictedDataScope,
} from '@/modules/identity-access'

export async function listLegacyProductionOrderReports(
  orderId: string,
  scope: EffectiveDataScope = unrestrictedDataScope,
) {
  await assertProductionOrderIdDataScope(scope, orderId)
  return prisma.workReport.findMany({
    where: { orderId },
    include: { step: true },
    orderBy: { createdAt: 'asc' },
  })
}

export async function reportLegacyProductionOrder(
  orderId: string,
  input: LegacyProductionOrderReportInput,
  scope: EffectiveDataScope = unrestrictedDataScope,
) {
  await assertProductionOrderIdDataScope(scope, orderId)
  return prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.findUnique({
      where: { id: orderId },
      select: { id: true, orderNo: true, productId: true, materialId: true, status: true },
    })
    if (!order) throw new ProductionOrderDomainError('工单不存在', 404)
    const compatibilityError = legacyProductionCompatibilityError(order.materialId)
    if (compatibilityError) throw new ProductionOrderDomainError(compatibilityError, 410)
    const statusError = legacyReportStatusError(order.status)
    if (statusError) throw new ProductionOrderDomainError(statusError)

    const route = await tx.processRoute.findFirst({
      where: { productId: order.productId },
      include: {
        steps: {
          where: { deletedAt: null },
          orderBy: { stepNo: 'asc' },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
    })
    if (!route) throw new ProductionOrderDomainError('物料无工艺路线')
    const currentStep = route.steps.find((step) => step.id === input.stepId)
    if (!currentStep) throw new ProductionOrderDomainError('工序不属于该工艺路线')

    const reports = await tx.workReport.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    })
    const previousError = incompletePreviousStepError(route.steps, reports, input.stepId)
    if (previousError) throw new ProductionOrderDomainError(previousError)

    const photoUrls = input.photoUrls ? JSON.stringify(input.photoUrls) : undefined
    const existing = reports.find((report) => report.stepId === input.stepId && !report.endTime)
    const report = existing
      ? await tx.workReport.update({
          where: { id: existing.id },
          data: {
            endTime: new Date(),
            goodQty: input.goodQty,
            badQty: input.badQty,
            badReason: input.badReason,
            remark: input.remark,
            photoUrls,
          },
        })
      : await tx.workReport.create({
          data: {
            orderId,
            stepId: input.stepId,
            workerName: input.workerName,
            workerId: input.workerId,
            startTime: new Date(),
            endTime: new Date(),
            goodQty: input.goodQty,
            badQty: input.badQty,
            badReason: input.badReason,
            remark: input.remark,
            photoUrls,
          },
        })

    const completedReports = existing
      ? reports.map((item) => item.id === existing.id ? report : item)
      : [...reports, report]
    const allStepsDone = areAllProductionStepsReported(route.steps, completedReports)
    const nextStatus = legacyOrderStatusAfterReport(order.status, allStepsDone)
    if (nextStatus !== order.status) {
      await tx.productionOrder.update({
        where: { id: order.id },
        data: {
          status: nextStatus,
          ...(nextStatus === 'QC_WAITING' ? { completeTime: new Date() } : {}),
        },
      })
    }
    return { order, report, allStepsDone, nextStatus }
  })
}
