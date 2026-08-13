import { prisma } from '@/lib/prisma'
import type { QualityTaskFilter } from '../contracts/quality-task'
import { qualityInspectionDataScopeWhere, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'

const tolerance = 0.000001

export async function listQualityTaskWorkspace(input: { keyword?: string; filter: QualityTaskFilter }, scope: EffectiveDataScope = unrestrictedDataScope) {
  const keyword = input.keyword?.trim() || ''
  const keywordWhere = keyword ? {
    OR: [
      { inspectionNo: { contains: keyword } },
      { lot: { lotNo: { contains: keyword } } },
      { lot: { material: { code: { contains: keyword } } } },
      { lot: { material: { name: { contains: keyword } } } },
      { sourceId: { contains: keyword } },
    ],
  } : {}
  const dispositionBalance = {
    some: { inventoryStatus: { in: ['HOLD', 'REWORK'] }, stockQty: { gt: tolerance } },
  }
  const where = input.filter === 'PENDING'
    ? { ...keywordWhere, status: 'PENDING', ...qualityInspectionDataScopeWhere(scope) }
    : input.filter === 'DISPOSITION'
      ? { AND: [{ ...keywordWhere, status: 'COMPLETED', lot: { balances: dispositionBalance } }, qualityInspectionDataScopeWhere(scope)] }
      : { AND: [keywordWhere, qualityInspectionDataScopeWhere(scope)] }
  const [rows, pending, dispositionLots] = await Promise.all([
    prisma.qualityInspection.findMany({
      where,
      include: {
        dispositions: { orderBy: { performedAt: 'desc' } },
        lot: { include: {
          material: { select: { id: true, code: true, name: true, stockUnit: true } },
          balances: true,
          qualityDispositions: { orderBy: { performedAt: 'desc' } },
        } },
      },
      orderBy: [{ createdAt: 'desc' }, { round: 'desc' }],
      take: 200,
    }),
    prisma.qualityInspection.count({ where: { status: 'PENDING', ...qualityInspectionDataScopeWhere(scope) } }),
    prisma.inventoryLot.count({ where: { status: 'OPEN', balances: { some: {
      inventoryStatus: { in: ['HOLD', 'REWORK'] }, stockQty: { gt: tolerance },
      ...(scope.inventoryMode === 'LOCATIONS' ? { locationId: { in: scope.locationIds } } : {}),
    } } } }),
  ])
  const seenLots = new Set<string>()
  const items = rows.filter((row) => {
    if (seenLots.has(row.lotId)) return false
    seenLots.add(row.lotId)
    return true
  }).slice(0, 100).map((row) => ({ ...row, dispositions: row.lot.qualityDispositions }))
  return { items, counts: { pending, disposition: dispositionLots } }
}
