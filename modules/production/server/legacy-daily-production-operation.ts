import { Prisma } from '@prisma/client'
import { LegacyDailyProductionError } from '../domain/legacy-daily-production-errors'

export async function runLegacyDailyProductionOperation<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof LegacyDailyProductionError) throw error
    if (error instanceof SyntaxError) {
      throw new LegacyDailyProductionError('历史成本层快照损坏，无法自动冲销')
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new LegacyDailyProductionError('生产记录编号冲突，请刷新后重试', 409)
    }
    if (error instanceof Error) throw new LegacyDailyProductionError(error.message)
    throw error
  }
}
