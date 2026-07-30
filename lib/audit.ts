import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
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

export async function getAuditContext(req: NextRequest | Request | null) {
  const operator = await getCurrentOperator()
  return {
    operatorId: operator?.id,
    operatorName: operator?.name,
    ipAddress: req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
    userAgent: req?.headers.get('user-agent') || undefined,
  }
}

export async function createAuditLog(
  client: Pick<Prisma.TransactionClient, 'auditLog'>,
  context: Awaited<ReturnType<typeof getAuditContext>>,
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

export async function writeAuditLog(req: NextRequest | Request | null, input: AuditInput) {
  try {
    const context = await getAuditContext(req)
    await createAuditLog(prisma, context, input)
  } catch (error) {
    console.error('Write audit log error:', error)
  }
}
