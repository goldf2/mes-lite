import { NextRequest } from 'next/server'
import { prisma } from './prisma'
import { getCurrentOperator } from './auth'
import { createAuditLog, type AuditContext, type AuditInput } from './audit-core'

export { createAuditLog }
export type { AuditContext, AuditInput }

export async function getAuditContext(req: NextRequest | Request | null) {
  const operator = await getCurrentOperator()
  return {
    operatorId: operator?.id,
    operatorName: operator?.name,
    ipAddress: req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
    userAgent: req?.headers.get('user-agent') || undefined,
  }
}

export async function writeAuditLog(req: NextRequest | Request | null, input: AuditInput) {
  await writeAuditLogWithContext(await getAuditContext(req), input)
}

export async function writeAuditLogWithContext(context: AuditContext, input: AuditInput) {
  try {
    await createAuditLog(prisma, context, input)
  } catch (error) {
    console.error('Write audit log error:', error)
  }
}
