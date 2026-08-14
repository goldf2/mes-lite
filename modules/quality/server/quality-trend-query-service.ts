import { prisma } from '@/lib/prisma'
import { qualityInspectionDataScopeWhere, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import type { QualityTrendQuery } from '../contracts/quality-trend-schema'

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export async function getQualityTrendWorkspace(input: QualityTrendQuery, scope: EffectiveDataScope = unrestrictedDataScope, now = new Date()) {
  const startDate = input.startDate ? new Date(input.startDate) : new Date(now.getTime() - 29 * 86_400_000)
  const endDate = input.endDate ? new Date(input.endDate) : now
  const rows = await prisma.qualityInspection.findMany({
    where: {
      AND: [
        { status: 'COMPLETED', checkedAt: { gte: startDate, lte: endDate } },
        qualityInspectionDataScopeWhere(scope),
        ...(input.materialId ? [{ lot: { materialId: input.materialId } }] : []),
        ...(input.sourceType ? [{ sourceType: input.sourceType }] : []),
      ],
    },
    include: {
      lot: { include: { material: { select: { id: true, code: true, name: true } } } },
      checkItems: true,
    },
    orderBy: { checkedAt: 'asc' }, take: 5000,
  })
  const summary = rows.reduce((result, row) => {
    result.completedInspections += 1
    if (row.result === 'PASS') result.passedInspections += 1
    else if (row.result === 'PARTIAL') result.partialInspections += 1
    else result.failedInspections += 1
    result.sampleQty += Number(row.sampleQty)
    result.goodQty += Number(row.goodQty)
    result.badQty += Number(row.badQty)
    return result
  }, { completedInspections: 0, passedInspections: 0, failedInspections: 0, partialInspections: 0, sampleQty: 0, goodQty: 0, badQty: 0, inspectionPassRate: 0, samplePassRate: 0 })
  summary.inspectionPassRate = summary.completedInspections ? round(summary.passedInspections / summary.completedInspections * 100) : 0
  summary.samplePassRate = summary.sampleQty ? round(summary.goodQty / summary.sampleQty * 100) : 0
  summary.sampleQty = round(summary.sampleQty, 6)
  summary.goodQty = round(summary.goodQty, 6)
  summary.badQty = round(summary.badQty, 6)

  const byDayMap = new Map<string, { date: string; completedInspections: number; passedInspections: number; failedInspections: number; partialInspections: number; sampleQty: number; goodQty: number; badQty: number; samplePassRate: number }>()
  const byMaterialMap = new Map<string, { materialId: string; code: string; name: string; completedInspections: number; passedInspections: number; failedInspections: number; partialInspections: number; sampleQty: number; goodQty: number; badQty: number; samplePassRate: number }>()
  const failedItemMap = new Map<string, number>()
  for (const row of rows) {
    const date = (row.checkedAt || row.createdAt).toISOString().slice(0, 10)
    const day = byDayMap.get(date) || { date, completedInspections: 0, passedInspections: 0, failedInspections: 0, partialInspections: 0, sampleQty: 0, goodQty: 0, badQty: 0, samplePassRate: 0 }
    const material = row.lot.material
    const materialRow = byMaterialMap.get(material.id) || { materialId: material.id, code: material.code, name: material.name, completedInspections: 0, passedInspections: 0, failedInspections: 0, partialInspections: 0, sampleQty: 0, goodQty: 0, badQty: 0, samplePassRate: 0 }
    for (const target of [day, materialRow]) {
      target.completedInspections += 1
      if (row.result === 'PASS') target.passedInspections += 1
      else if (row.result === 'PARTIAL') target.partialInspections += 1
      else target.failedInspections += 1
      target.sampleQty += Number(row.sampleQty)
      target.goodQty += Number(row.goodQty)
      target.badQty += Number(row.badQty)
    }
    byDayMap.set(date, day)
    byMaterialMap.set(material.id, materialRow)
    for (const item of row.checkItems.filter((check) => check.result === 'FAIL')) failedItemMap.set(item.name, (failedItemMap.get(item.name) || 0) + 1)
  }
  const finalize = <T extends { sampleQty: number; goodQty: number; badQty: number; samplePassRate: number }>(item: T) => ({
    ...item, sampleQty: round(item.sampleQty, 6), goodQty: round(item.goodQty, 6), badQty: round(item.badQty, 6), samplePassRate: item.sampleQty ? round(item.goodQty / item.sampleQty * 100) : 0,
  })
  return {
    range: { startDate: startDate.toISOString(), endDate: endDate.toISOString(), truncated: rows.length === 5000 },
    summary,
    byDay: Array.from(byDayMap.values()).map(finalize),
    byMaterial: Array.from(byMaterialMap.values()).map(finalize).sort((a, b) => b.failedInspections - a.failedInspections || a.code.localeCompare(b.code)).slice(0, 50),
    failedItems: Array.from(failedItemMap, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 20),
  }
}
