import type { Prisma } from '@prisma/client'
import { createAuditLog, type AuditContext } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { resolveInventoryLocation } from '@/lib/inventory'
import { assertInventoryLocationDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import type { DailyProductionShortcutInput } from '../contracts/daily-production-shortcut-schema'
import { LegacyDailyProductionError } from '../domain/legacy-daily-production-errors'
import {
  buildLegacyDailyProductionReportNo,
  parseLegacyDailyProductionReportDate,
} from '../domain/legacy-daily-production-rules'
import { buildLegacyDailyProductionConsumption } from './legacy-daily-production-consumption'
import { runLegacyDailyProductionOperation } from './legacy-daily-production-operation'
import { legacyDailyProductionReportInclude, listLegacyDailyProductionWorkspace } from './legacy-daily-production-query-service'
import { confirmLegacyDailyProductionReportInTransaction } from './legacy-daily-production-status-service'

async function createShortcutDraft(tx: Prisma.TransactionClient, input: DailyProductionShortcutInput) {
  const reportDate = parseLegacyDailyProductionReportDate(input.reportDate)
  const [consumptionLocation, outputLocation, snapshot, existingReports] = await Promise.all([
    resolveInventoryLocation(tx, input.consumptionLocationId),
    resolveInventoryLocation(tx, input.outputLocationId),
    buildLegacyDailyProductionConsumption(
      tx,
      input.finishedMaterialId,
      input.outputQty,
      input.consumptions,
      { bomId: input.bomId },
    ),
    tx.dailyProductionReport.findMany({
      where: { reportDate },
      select: { reportNo: true },
    }),
  ])
  const reportNo = buildLegacyDailyProductionReportNo(reportDate, existingReports.map((item) => item.reportNo))
  return tx.dailyProductionReport.create({
    data: {
      reportNo,
      reportDate,
      finishedMaterialId: input.finishedMaterialId,
      consumptionLocationId: consumptionLocation.id,
      outputLocationId: outputLocation.id,
      outputQty: input.outputQty,
      workers: '快捷生产日报',
      note: input.note || null,
      bomId: snapshot.bom.id,
      bomName: snapshot.bom.name,
      bomVersion: snapshot.bom.version,
      bomType: 'PRODUCTION',
      bomOutputQuantity: snapshot.bom.outputQuantity,
      bomOutputUnit: snapshot.bom.outputUnit,
      consumptions: { create: snapshot.consumptions },
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
    input.consumptionLocationId,
    input.outputLocationId,
    ...input.consumptions.map((line) => line.locationId),
  ])
  return runLegacyDailyProductionOperation(() => prisma.$transaction(async (tx) => {
    const draft = await createShortcutDraft(tx, input)
    const { result } = await confirmLegacyDailyProductionReportInTransaction(tx, draft.id, confirmedBy)
    await createAuditLog(tx, auditContext, {
      action: 'CONFIRM',
      entityType: 'DAILY_PRODUCTION_REPORT',
      entityId: result.id,
      entityLabel: result.reportNo,
      beforeData: null,
      afterData: result,
      note: '快捷生产日报按正式 BOM 原子扣减投入并增加产出；不创建生产订单、派工、报工或质检记录',
    })
    return result
  }))
}

export async function listDailyProductionShortcutWorkspace(scope: EffectiveDataScope) {
  const workspace = await listLegacyDailyProductionWorkspace({})
  const reports = scope.inventoryMode === 'ALL'
    ? workspace.reports
    : workspace.reports.filter((report) => (
        Boolean(report.outputLocationId)
        && scope.locationIds.includes(report.outputLocationId!)
        && report.consumptions.every((line) => scope.locationIds.includes(line.locationId))
      ))
  return { reports, materials: workspace.materials }
}
