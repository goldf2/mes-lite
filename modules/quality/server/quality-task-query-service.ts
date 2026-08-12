import { prisma } from '@/lib/prisma'
import type { QualityTaskFilter } from '../contracts/quality-task'

const tolerance = 0.000001

export async function listQualityTaskWorkspace(input: { keyword?: string; filter: QualityTaskFilter }) {
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
    ? { ...keywordWhere, status: 'PENDING' }
    : input.filter === 'DISPOSITION'
      ? { ...keywordWhere, status: 'COMPLETED', lot: { balances: dispositionBalance } }
      : keywordWhere
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
    prisma.qualityInspection.count({ where: { status: 'PENDING' } }),
    prisma.inventoryLot.count({ where: { status: 'OPEN', balances: dispositionBalance } }),
  ])
  const seenLots = new Set<string>()
  const items = rows.filter((row) => {
    if (seenLots.has(row.lotId)) return false
    seenLots.add(row.lotId)
    return true
  }).slice(0, 100).map((row) => ({ ...row, dispositions: row.lot.qualityDispositions }))
  return { items, counts: { pending, disposition: dispositionLots } }
}
