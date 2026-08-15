import { Prisma } from '@prisma/client'

export type AuditInput = {
  action: string
  entityType: string
  entityId?: string | null
  entityLabel?: string | null
  beforeData?: unknown
  afterData?: unknown
  note?: string
}

export type AuditContext = {
  operatorId?: string
  operatorName?: string
  ipAddress?: string
  userAgent?: string
}

function stringifySnapshot(value: unknown) {
  if (value === undefined) return undefined
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'bigint') return item.toString()
    if (item instanceof Date) return item.toISOString()
    return item
  })
}

export async function createAuditLog(
  client: Pick<Prisma.TransactionClient, 'auditLog'>,
  context: AuditContext,
  input: AuditInput,
) {
  return client.auditLog.create({
    data: {
      ...context,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId || undefined,
      entityLabel: input.entityLabel || undefined,
      beforeData: stringifySnapshot(input.beforeData),
      afterData: stringifySnapshot(input.afterData),
      note: input.note,
    },
  })
}
