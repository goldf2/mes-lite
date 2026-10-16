import { NextRequest, NextResponse } from 'next/server'
import { setSessionCookie } from '@/lib/auth'
import { getAuditContext, writeAuditLogWithContext } from '@/lib/audit'
import { loginInputSchema } from '../contracts/authentication'
import { loginWithPassword } from '../server/authentication-service'
import { authenticationHttpError } from './authentication-http'
import { enforceAuthenticationRequestLimit, serializeAuthenticationWrite } from './authentication-request'

export async function nativeAdminLoginPost(request: NextRequest) {
  return serializeAuthenticationWrite(async () => {
    try {
      await enforceAuthenticationRequestLimit(request, 'LOGIN')
      const { operator, session } = await loginWithPassword(loginInputSchema.parse(await request.json()), new Date(), { administratorRecovery: true })
      await writeAuditLogWithContext({ ...await getAuditContext(request), operatorId: operator.id, operatorName: operator.name }, {
        action: 'LOGIN', entityType: 'OPERATOR', entityId: operator.id, entityLabel: operator.username,
        afterData: { authSource: 'native-admin-recovery', role: operator.role, status: operator.status },
      })
      const response = NextResponse.json({ data: operator, message: '已使用现有管理员账号登录' }, { headers: { 'Cache-Control': 'no-store' } })
      setSessionCookie(response, session.token, session.expiresAt)
      return response
    } catch (error) { return authenticationHttpError(error, '管理员恢复登录失败') }
  })
}
