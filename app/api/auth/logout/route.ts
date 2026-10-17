import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { getAuditContext, writeAuditLogWithContext } from '@/lib/audit'
import { clearSessionCookie, SESSION_COOKIE } from '@/lib/auth'
import { CASDOOR_CHALLENGE_COOKIE, revokeCasdoorBrowserAttempt } from '@/modules/identity-access/server/casdoor-login-service'
import { operatorSessionLogoutContext, revokeOperatorSession } from '@/modules/identity-access/server/authentication-service'
import { readLoginConfiguration } from '@/modules/identity-access/domain/casdoor-runtime'
import { ensureAuthenticationRuntime } from '@/modules/identity-access/server/authentication-runtime-service'
import { CASDOOR_LOGOUT_PATH, casdoorLogoutConnection, createCasdoorLogoutHandoff, readCasdoorLogoutHint } from '@/modules/identity-access/server/casdoor-logout-service'
import { clearCasdoorLogoutCookies, setCasdoorLogoutHandoffCookies } from '@/modules/identity-access/http/casdoor-logout-http'

export async function POST(req: NextRequest) {
  const token = cookies().get(SESSION_COOKIE)?.value
  const session = await operatorSessionLogoutContext(token)
  let handoff: ReturnType<typeof createCasdoorLogoutHandoff>|null = null
  if (token && session?.authSource === 'casdoor' && session.expiresAt.getTime() > Date.now()) {
    try {
      const config = casdoorLogoutConnection(await ensureAuthenticationRuntime())
      if (config && session.authGeneration === config.generation) {
        const hint = readCasdoorLogoutHint(config, cookies(), token, session.expiresAt)
        if (hint) handoff = createCasdoorLogoutHandoff(config, hint)
      }
    } catch { /* Local revocation must still complete when provider handoff cannot be prepared. */ }
  }
  const auditContext = await getAuditContext(req)
  if (token) await revokeOperatorSession(token)
  await revokeCasdoorBrowserAttempt(cookies().get(CASDOOR_CHALLENGE_COOKIE)?.value || '')
  if (auditContext.operatorId) await writeAuditLogWithContext(auditContext, {
    action: 'LOGOUT',
    entityType: 'OPERATOR_SESSION',
    entityId: auditContext.operatorId,
    entityLabel: auditContext.operatorName,
  })
  const config = readLoginConfiguration()
  const providerLogoutIssuer = !handoff && config.mode === 'casdoor' && config.ready && session?.authSource !== 'native-admin-recovery' ? config.connection?.issuer || null : null
  const response = NextResponse.json({ success: true, message: '本站会话已退出', providerLogoutIssuer, handoffUrl: handoff ? CASDOOR_LOGOUT_PATH : null }, { headers: { 'Cache-Control': 'no-store' } })
  if (handoff) setCasdoorLogoutHandoffCookies(response, handoff)
  else clearCasdoorLogoutCookies(response)
  response.cookies.set(CASDOOR_CHALLENGE_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
  clearSessionCookie(response)
  return response
}
