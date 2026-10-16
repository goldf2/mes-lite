import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { getAuditContext, writeAuditLogWithContext } from '@/lib/audit'
import { clearSessionCookie, SESSION_COOKIE } from '@/lib/auth'
import { CASDOOR_CHALLENGE_COOKIE, revokeCasdoorBrowserAttempt } from '@/modules/identity-access/server/casdoor-login-service'
import { revokeOperatorSession } from '@/modules/identity-access/server/authentication-service'

export async function POST(req: NextRequest) {
  const auditContext = await getAuditContext(req)
  const token = cookies().get(SESSION_COOKIE)?.value
  if (token) await revokeOperatorSession(token)
  await revokeCasdoorBrowserAttempt(cookies().get(CASDOOR_CHALLENGE_COOKIE)?.value || '')
  if (auditContext.operatorId) await writeAuditLogWithContext(auditContext, {
    action: 'LOGOUT',
    entityType: 'OPERATOR_SESSION',
    entityId: auditContext.operatorId,
    entityLabel: auditContext.operatorName,
  })
  const response = NextResponse.json({ success: true, message: '已退出' })
  response.cookies.set(CASDOOR_CHALLENGE_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
  clearSessionCookie(response)
  return response
}
