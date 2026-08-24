import type { Prisma } from '@prisma/client'
import { createAuditLog, type AuditContext } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { assertInventoryLocationDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import type { DailyProductionShortcutInput } from '../contracts/daily-production-shortcut-schema'
import { LegacyDailyProductionError } from '../domain/legacy-daily-production-errors'
import {
  buildLegacyDailyProductionReportNo,
  parseLegacyDailyProductionReportDate,
} from '../domain/legacy-daily-production-rules'
import { runLegacyDailyProductionOperation } from './legacy-daily-production-operation'
import { legacyDailyProductionReportInclude, listLegacyDailyProductionWorkspace } from './legacy-daily-production-query-service'
import { confirmLegacyDailyProductionReportInTransaction } from './legacy-daily-production-status-service'
import { buildProductionOrderActualLines } from './production-order-actual-lines'

async function loadReleasedBomSnapshot(tx: Prisma.TransactionClient, bomId?: string) {
  if (!bomId) return null
  const bom = await tx.bOM.findFirst({
    where: { id: bomId, status: 'RELEASED' },
    select: {
      id: true, name: true, version: true, purpose: true, outputQuantity: true, outputUnit: true,
      outputs: {
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true, materialId: true, quantity: true, unit: true, isPrimary: true,
          material: { select: { code: true, name: true, stockUnit: true, unit: true } },
        },
      },
      items: {
        where: { itemType: 'MATERIAL', materialId: { not: null } },
        orderBy: { id: 'asc' },
        select: {
          id: true, materialId: true, outputMaterialId: true, quantity: true, unit: true,
          material: { select: { code: true, name: true, stockUnit: true, unit: true } },
        },
      },
    },
  })
  if (!bom || bom.outputs.length === 0 || bom.items.length === 0) {
    throw new LegacyDailyProductionError('所选 BOM 不存在、未发布或结构不完整')
  }
  if (bom.outputs.filter((output) => output.isPrimary).length !== 1) {
    throw new LegacyDailyProductionError('所选 BOM 必须且只能包含一项主产出')
  }
  return bom
}

async function createShortcutDraft(tx: Prisma.TransactionClient, input: DailyProductionShortcutInput) {
  const reportDate = parseLegacyDailyProductionReportDate(input.reportDate)
  const primaryRequest = input.outputs.find((line) => line.isPrimary)!
  const [bom, existingReports] = await Promise.all([
    loadReleasedBomSnapshot(tx, input.bomId),
    tx.dailyProductionReport.findMany({
      where: { reportDate },
      select: { reportNo: true },
    }),
  ])
  const lines = await buildProductionOrderActualLines(
    tx,
    {
      bomSnapshotValue: bom ? JSON.stringify(bom) : null,
      targetMaterialId: primaryRequest.materialId,
    },
    input.consumptions,
    input.outputs,
  )
  if ((!bom || lines.hasBomDeviation) && (input.note?.trim().length || 0) < 2) {
    throw new LegacyDailyProductionError('无 BOM 临时生产或计划外投入产出必须填写备注')
  }
  const primaryOutput = lines.outputs.find((line) => line.isPrimary)!
  const reportNo = buildLegacyDailyProductionReportNo(reportDate, existingReports.map((item) => item.reportNo))
  return tx.dailyProductionReport.create({
    data: {
      reportNo,
      reportDate,
      finishedMaterialId: primaryOutput.materialId,
      consumptionLocationId: lines.inputs[0]?.locationId || null,
      outputLocationId: primaryOutput.locationId,
      outputQty: primaryOutput.actualQty,
      workers: '快捷生产日报',
      note: input.note || null,
      bomId: bom?.id || '',
      bomName: bom?.name || '临时生产 / 转换',
      bomVersion: bom?.version || '无 BOM',
      bomType: bom?.purpose || 'TEMPORARY',
      bomOutputQuantity: Number(lines.primaryOutput?.quantity || primaryOutput.actualQty),
      bomOutputUnit: lines.primaryOutput?.unit || primaryOutput.unit,
      consumptions: {
        create: lines.inputs.map((line) => ({
          materialId: line.materialId,
          locationId: line.locationId,
          bomItemId: line.bomItemId,
          materialCode: line.materialCode,
          materialName: line.materialName,
          quantityPerUnit: line.quantityPerBatch,
          wastageRate: line.lossMode === 'PERCENT' ? line.lossValue : 0,
          lossMode: line.lossMode,
          lossValue: line.lossValue,
          lossQty: line.lossQty,
          plannedQty: line.plannedQty,
          actualQty: line.actualQty,
          unit: line.unit,
        })),
      },
      outputs: { create: lines.outputs },
    },
    include: legacyDailyProductionReportInclude,
  })
}

export function createAndConfirmDailyProductionShortcut(
  input: DailyProductionShortcutInput,
  scope: EffectiveDataScope,
  confirmedBy: string,
  auditContext: AuditContext,
) {
  assertInventoryLocationDataScope(scope, [
    ...input.consumptions.map((line) => line.locationId),
    ...input.outputs.map((line) => line.locationId),
  ])
  return runLegacyDailyProductionOperation(() => prisma.$transaction(async (tx) => {
    const draft = await createShortcutDraft(tx, input)
    const qualityInspection = input.outputDisposition === 'QUALITY_INSPECTION'
    const { result } = await confirmLegacyDailyProductionReportInTransaction(
      tx,
      draft.id,
      confirmedBy,
      new Date(),
      { createQualityInspection: qualityInspection },
    )
    await createAuditLog(tx, auditContext, {
      action: 'CONFIRM',
      entityType: 'DAILY_PRODUCTION_REPORT',
      entityId: result.id,
      entityLabel: result.reportNo,
      beforeData: null,
      afterData: result,
      note: qualityInspection
        ? '快捷生产/转换按实际多投入多产出原子过账，产出进入待检库存并创建质量任务；BOM 仅作为可选预设'
        : '快捷生产/转换按实际多投入多产出原子过账并直接增加可用产出；BOM 仅作为可选预设',
    })
    return result
  }))
}

export async function listDailyProductionShortcutWorkspace(scope: EffectiveDataScope) {
  const workspace = await listLegacyDailyProductionWorkspace({})
  const reports = scope.inventoryMode === 'ALL'
    ? workspace.reports
    : workspace.reports.filter((report) => (
        (report.outputs.length > 0
          ? report.outputs.every((line) => scope.locationIds.includes(line.locationId))
          : Boolean(report.outputLocationId) && scope.locationIds.includes(report.outputLocationId!))
        && report.consumptions.every((line) => scope.locationIds.includes(line.locationId))
      ))
  const outputIds = reports.flatMap((report) => report.outputs.map((output) => output.id))
  const inspections = reports.length === 0 ? [] : await prisma.qualityInspection.findMany({
    where: {
      sourceType: 'PRODUCTION_ORDER_ACTUAL_OUTPUT',
      sourceId: { in: [...reports.map((report) => report.id), ...outputIds] },
    },
    select: { id: true, sourceId: true, inspectionNo: true, status: true, result: true },
  })
  const inspectionByReport = new Map(inspections.map((inspection) => [inspection.sourceId, inspection]))
  return {
    reports: reports.map((report) => ({
      ...report,
      qualityInspection: inspectionByReport.get(report.outputs.find((output) => output.isPrimary)?.id || report.id)
        || inspectionByReport.get(report.id)
        || null,
    })),
    materials: workspace.materials,
  }
}
