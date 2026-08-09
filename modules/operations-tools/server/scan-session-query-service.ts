import { prisma } from '@/lib/prisma'
import { scanSessionInclude } from './scan-print-select'

export async function listScanSessions(query: { referenceId?: string | null; purpose?: string | null }) {
  return prisma.scanCountSession.findMany({
    where: {
      ...(query.referenceId ? { referenceId: query.referenceId } : {}),
      ...(query.purpose ? { purpose: query.purpose } : {}),
    },
    include: scanSessionInclude,
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}
