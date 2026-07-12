import { NextRequest } from 'next/server'
import { prisma } from './prisma'
import { getCurrentOperator } from './auth'

type AuditInput = {
  action: string
  entityType: string
  entityId?: string | null
  entityLabel?: string | null
  beforeData?: unknown
  afterData?: unknown
  note?: string
}

function stringifySnapshot(value: unknown) {
  if (value === undefined) return undefined
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'bigint') return item.toString()
    if (item instanceof Date) return item.toISOString()
    return item
  })
}

export async function writeAuditLog(req: NextRequest | Request | null, input: AuditInput) {
  try {
    const operator = await getCurrentOperator()
    await prisma.auditLog.create({
      data: {
        operatorId: operator?.id,
        operatorName: operator?.name,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId || undefined,
        entityLabel: input.entityLabel || undefined,
        beforeData: stringifySnapshot(input.beforeData),
        afterData: stringifySnapshot(input.afterData),
        note: input.note,
        ipAddress: req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
        userAgent: req?.headers.get('user-agent') || undefined,
      },
    })
  } catch (error) {
    console.error('Write audit log error:', error)
  }
}
