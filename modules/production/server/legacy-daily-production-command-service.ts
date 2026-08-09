import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveInventoryLocation } from '@/lib/inventory'
import { employeeNamesSnapshot, resolveActiveEmployees } from '@/modules/configuration'
import type { LegacyDailyProductionReportInput } from '../contracts/legacy-daily-production-schema'
import { LegacyDailyProductionError } from '../domain/legacy-daily-production-errors'
import {
  assertLegacyDailyProductionDraft,
  buildLegacyDailyProductionReportNo,
  parseLegacyDailyProductionReportDate,
} from '../domain/legacy-daily-production-rules'
import { buildLegacyDailyProductionConsumption } from './legacy-daily-production-consumption'
import { runLegacyDailyProductionOperation } from './legacy-daily-production-operation'
import { legacyDailyProductionReportInclude } from './legacy-daily-production-query-service'

async function nextLegacyDailyProductionReportNo(tx: Prisma.TransactionClient, date: Date) {
  const start = new Date(date)
  const end = new Date(date)
  end.setDate(end.getDate() + 1)
  const records = await tx.dailyProductionReport.findMany({
    where: { reportDate: { gte: start, lt: end } },
    select: { reportNo: true },
  })
  return buildLegacyDailyProductionReportNo(date, records.map((item) => item.reportNo))
}

function legacyDailyProductionWriteData(
  input: LegacyDailyProductionReportInput,
  reportDate: Date,
  consumptionLocationId: string,
  outputLocationId: string,
  employees: Array<{ id: string; code: string; name: string }>,
  snapshot: Awaited<ReturnType<typeof buildLegacyDailyProductionConsumption>>,
) {
  return {
    reportDate,
    finishedMaterialId: input.finishedMaterialId,
    consumptionLocationId,
    outputLocationId,
    outputQty: input.outputQty,
    workers: employeeNamesSnapshot(employees),
    note: input.note || null,
    bomId: snapshot.bom.id,
    bomName: snapshot.bom.name,
    bomVersion: snapshot.bom.version,
    bomType: 'PRODUCTION',
    bomOutputQuantity: snapshot.bom.outputQuantity,
    bomOutputUnit: snapshot.bom.outputUnit,
  }
}

export async function createLegacyDailyProductionReport(input: LegacyDailyProductionReportInput) {
  return runLegacyDailyProductionOperation(() => prisma.$transaction(async (tx) => {
    const reportDate = parseLegacyDailyProductionReportDate(input.reportDate)
    const consumptionLocation = await resolveInventoryLocation(tx, input.consumptionLocationId)
    const outputLocation = await resolveInventoryLocation(tx, input.outputLocationId)
    const employees = await resolveActiveEmployees(tx, input.employeeIds)
    const snapshot = await buildLegacyDailyProductionConsumption(
      tx, input.finishedMaterialId, input.outputQty, input.consumptions, { bomId: input.bomId },
    )
    const reportNo = await nextLegacyDailyProductionReportNo(tx, reportDate)
    return tx.dailyProductionReport.create({
      data: {
        reportNo,
        ...legacyDailyProductionWriteData(
          input, reportDate, consumptionLocation.id, outputLocation.id, employees, snapshot,
        ),
        employees: {
          create: employees.map((employee) => ({
            employeeId: employee.id, employeeCode: employee.code, employeeName: employee.name,
          })),
        },
        consumptions: { create: snapshot.consumptions },
      },
      include: legacyDailyProductionReportInclude,
    })
  }))
}

export async function updateLegacyDailyProductionReport(id: string, input: LegacyDailyProductionReportInput) {
  return runLegacyDailyProductionOperation(() => prisma.$transaction(async (tx) => {
    const existing = await tx.dailyProductionReport.findUnique({ where: { id } })
    if (!existing) throw new LegacyDailyProductionError('生产记录不存在', 404)
    assertLegacyDailyProductionDraft(existing.status, '修改')
    const consumptionLocation = await resolveInventoryLocation(tx, input.consumptionLocationId || existing.consumptionLocationId)
    const outputLocation = await resolveInventoryLocation(tx, input.outputLocationId || existing.outputLocationId)
    const employees = await resolveActiveEmployees(tx, input.employeeIds)
    const snapshot = await buildLegacyDailyProductionConsumption(
      tx, input.finishedMaterialId, input.outputQty, input.consumptions, { bomId: input.bomId },
    )
    await tx.dailyProductionConsumption.deleteMany({ where: { reportId: existing.id } })
    await tx.dailyProductionReportEmployee.deleteMany({ where: { reportId: existing.id } })
    const reportDate = parseLegacyDailyProductionReportDate(input.reportDate)
    const report = await tx.dailyProductionReport.update({
      where: { id: existing.id },
      data: {
        ...legacyDailyProductionWriteData(
          input, reportDate, consumptionLocation.id, outputLocation.id, employees, snapshot,
        ),
        employees: {
          create: employees.map((employee) => ({
            employeeId: employee.id, employeeCode: employee.code, employeeName: employee.name,
          })),
        },
        consumptions: { create: snapshot.consumptions },
      },
      include: legacyDailyProductionReportInclude,
    })
    return { existing, report }
  }))
}
