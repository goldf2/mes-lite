interface ProductionStepLike {
  id: string
  name: string
  stepNo: number
}

interface WorkReportLike {
  stepId: string
  endTime: Date | null
}

export function legacyProductionCompatibilityError(materialId: string | null | undefined) {
  return materialId
    ? '当前工单使用生产实绩流程，不允许继续写入旧领料、工序报工或工单入库记录'
    : null
}

export function legacyPickStatusError(status: string) {
  return status === 'CONFIRMED' ? null : `工单状态为 ${status}，不可领料`
}

export function legacyReportStatusError(status: string) {
  return ['RUNNING', 'PICKED'].includes(status) ? null : `工单状态为 ${status}，不可报工`
}

export function legacyStockInStatusError(status: string) {
  return status === 'QC_DONE' ? null : `工单状态为 ${status}，未质检通过不可入库`
}

export function previousProductionStep(steps: ProductionStepLike[], stepId: string) {
  const ordered = [...steps].sort((left, right) => left.stepNo - right.stepNo)
  const currentIndex = ordered.findIndex((step) => step.id === stepId)
  return currentIndex > 0 ? ordered[currentIndex - 1] : null
}

export function incompletePreviousStepError(
  steps: ProductionStepLike[],
  reports: WorkReportLike[],
  stepId: string,
) {
  const previous = previousProductionStep(steps, stepId)
  if (!previous) return null
  return reports.some((report) => report.stepId === previous.id && report.endTime)
    ? null
    : `上一工序「${previous.name}」未完成，不可报工`
}

export function areAllProductionStepsReported(steps: ProductionStepLike[], reports: WorkReportLike[]) {
  return steps.every((step) => reports.some((report) => report.stepId === step.id && report.endTime))
}

export function legacyOrderStatusAfterReport(currentStatus: string, allStepsDone: boolean) {
  if (allStepsDone) return 'QC_WAITING'
  return currentStatus === 'PICKED' ? 'RUNNING' : currentStatus
}
