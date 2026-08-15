import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { getAuditContext, writeAuditLogWithContext } from '@/lib/audit'
import { clearSessionCookie, SESSION_COOKIE } from '@/lib/auth'
import { revokeOperatorSession } from '@/modules/identity-access/server/authentication-service'

export async function POST(req: NextRequest) {
  const auditContext = await getAuditContext(req)
  const token = cookies().get(SESSION_COOKIE)?.value
  if (token) await revokeOperatorSession(token)
  if (auditContext.operatorId) await writeAuditLogWithContext(auditContext, {
    action: 'LOGOUT',
    entityType: 'OPERATOR_SESSION',
    entityId: auditContext.operatorId,
    entityLabel: auditContext.operatorName,
  })
  const response = NextResponse.json({ success: true, message: '已退出' })
  clearSessionCookie(response)
  return response
}
