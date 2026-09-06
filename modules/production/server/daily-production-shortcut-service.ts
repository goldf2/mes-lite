import type { Prisma } from '@prisma/client'
import { createAuditLog, type AuditContext } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { materialProductPrefix, resolveProductId } from '@/lib/material-product'
import { assertInventoryLocationDataScope, stockDataScopeWhere, type EffectiveDataScope } from '@/modules/identity-access'
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
import {
  parseProductionOrderProcessRouteSnapshot,
  serializeProductionOrderCostSnapshot,
  serializeProductionOrderProcessRouteSnapshot,
} from '../domain/production-order-execution-snapshots'

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
  const productId = await resolveProductId(tx, `${materialProductPrefix}${primaryRequest.materialId}`, {
    description: '由物料自动映射，用于生产日报成本追溯。',
  })
  const routes = await tx.processRoute.findMany({
    where: { productId },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    include: {
      steps: {
        where: { deletedAt: null },
        orderBy: { stepNo: 'asc' },
        include: { workCenter: { select: { id: true, code: true, name: true, laborRatePerHour: true, machineRatePerHour: true, energyCostPerHour: true } } },
      },
    },
  })
  const selectedBomCostRun = input.bomCostRunId ? await tx.bomCostRun.findFirst({
    where: {
      id: input.bomCostRunId,
      productId,
      bomId: bom?.id || '__missing__',
      OR: [{ materialId: null }, { materialId: primaryRequest.materialId }],
    },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  }) : null
  if (input.bomCostRunId && (!bom || !selectedBomCostRun)) {
    throw new LegacyDailyProductionError('所选成本运行不存在或不属于当前 BOM')
  }
  const selectedRoute = selectedBomCostRun
    ? (selectedBomCostRun.processRouteId ? routes.find((route) => route.id === selectedBomCostRun.processRouteId) : null)
    : routes[0]
  if (selectedBomCostRun?.processRouteId && !selectedRoute) {
    throw new LegacyDailyProductionError('所选成本运行对应的工艺路线不存在')
  }
  if (selectedBomCostRun?.processRouteId && !selectedBomCostRun.processRouteSnapshot) {
    throw new LegacyDailyProductionError('所选成本运行缺少冻结工艺快照，请重新计算成本后再用于生产')
  }
  const processRoute = selectedRoute || null
  const selectedProcessRouteSnapshot = selectedBomCostRun?.processRouteSnapshot
    ? parseProductionOrderProcessRouteSnapshot(selectedBomCostRun.processRouteSnapshot)
    : null
  const processRouteId = selectedBomCostRun ? selectedBomCostRun.processRouteId : processRoute?.id || null
  const processRouteName = selectedBomCostRun ? selectedBomCostRun.processRouteName : processRoute?.name || null
  const bomCostRun = selectedBomCostRun || (bom ? await tx.bomCostRun.findFirst({
    where: {
      productId,
      bomId: bom.id,
      processRouteId: processRoute?.id || null,
      OR: [{ processRouteId: null }, { processRouteSnapshot: { not: null } }],
    },
    orderBy: { createdAt: 'desc' },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  }) : null)
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
      processRouteId,
      processRouteName,
      processRouteSnapshot: selectedProcessRouteSnapshot
        ? JSON.stringify(selectedProcessRouteSnapshot)
        : serializeProductionOrderProcessRouteSnapshot(processRoute),
      bomCostRunId: bomCostRun?.id || null,
      bomCostSnapshot: serializeProductionOrderCostSnapshot(bomCostRun),
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
  const materialIds = workspace.materials.map((material) => material.id)
  const [inspections, stocks] = await Promise.all([
    reports.length === 0 ? [] : prisma.qualityInspection.findMany({
      where: {
        sourceType: 'PRODUCTION_ORDER_ACTUAL_OUTPUT',
        sourceId: { in: [...reports.map((report) => report.id), ...outputIds] },
      },
      select: { id: true, sourceId: true, inspectionNo: true, status: true, result: true },
    }),
    materialIds.length === 0 ? [] : prisma.stock.findMany({
      where: { AND: [{ materialId: { in: materialIds } }, stockDataScopeWhere(scope)] },
      select: {
        materialId: true,
        availableQty: true,
        locationBalances: {
          where: scope.inventoryMode === 'ALL' ? {} : { locationId: { in: scope.locationIds } },
          select: { locationId: true, qty: true, availableQty: true },
        },
      },
    }),
  ])
  const inspectionByReport = new Map(inspections.map((inspection) => [inspection.sourceId, inspection]))
  const stockByMaterial = new Map(stocks.flatMap((stock) => stock.materialId ? [[stock.materialId, stock] as const] : []))
  return {
    reports: reports.map((report) => ({
      ...report,
      qualityInspection: inspectionByReport.get(report.outputs.find((output) => output.isPrimary)?.id || report.id)
        || inspectionByReport.get(report.id)
        || null,
    })),
    materials: workspace.materials.map((material) => {
      const stock = stockByMaterial.get(material.id)
      const locationBalances = stock?.locationBalances.map((balance) => ({
        locationId: balance.locationId,
        qty: Number(balance.qty),
        availableQty: Number(balance.availableQty),
      })) || []
      return {
        ...material,
        inventory: {
          availableQty: scope.inventoryMode === 'ALL'
            ? Number(stock?.availableQty || 0)
            : locationBalances.reduce((sum, balance) => sum + balance.availableQty, 0),
          restricted: scope.inventoryMode !== 'ALL',
          locationBalances,
        },
      }
    }),
  }
}
