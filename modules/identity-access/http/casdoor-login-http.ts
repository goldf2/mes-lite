import { NextRequest, NextResponse } from 'next/server'
import { getAuditContext, writeAuditLogWithContext } from '@/lib/audit'
import { setSessionCookie } from '@/lib/auth'
import { CasdoorLoginError } from '../domain/casdoor-runtime'
import { readLoginConfiguration } from '../domain/casdoor-runtime'
import { beginCasdoorLogin, completeCasdoorLogin, CASDOOR_CHALLENGE_COOKIE } from '../server/casdoor-login-service'
import { enforceAuthenticationRequestLimit } from './authentication-request'

const headers = { 'Cache-Control': 'no-store' }
function challengeCookie(response: NextResponse, value: string, maxAge: number) {
  response.cookies.set(CASDOOR_CHALLENGE_COOKIE, value, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge })
}
export async function casdoorLoginGet(request: NextRequest) {
  try {
    await enforceAuthenticationRequestLimit(request, 'LOGIN')
    const login = await beginCasdoorLogin(request.nextUrl.searchParams.get('next'))
    const response = NextResponse.redirect(login.authorizationUrl, { headers })
    challengeCookie(response, login.ticket, 300)
    return response
  } catch (error) {
    return NextResponse.json({ error: error instanceof CasdoorLoginError ? error.code : 'CASDOOR_UNAVAILABLE' }, { status: error instanceof CasdoorLoginError ? error.status : 503, headers })
  }
}
export async function casdoorCallbackGet(request: NextRequest) {
  const config = readLoginConfiguration()
  if (!config.origin) return NextResponse.json({ error: 'CASDOOR_UNAVAILABLE' }, { status: 503, headers })
  try {
    const result = await completeCasdoorLogin(request.url, request.cookies.get(CASDOOR_CHALLENGE_COOKIE)?.value || '')
    await writeAuditLogWithContext({ ...await getAuditContext(request), operatorId: result.operatorId, operatorName: result.operatorName }, {
      action: 'LOGIN', entityType: 'OPERATOR', entityId: result.operatorId, entityLabel: result.operatorUsername,
      afterData: { authSource: 'casdoor' },
    })
    const response = NextResponse.redirect(new URL(result.next, config.origin), { headers })
    challengeCookie(response, '', 0)
    setSessionCookie(response, result.session.token, result.session.expiresAt)
    return response
  } catch (error) {
    const code = error instanceof CasdoorLoginError ? error.code : 'CASDOOR_LOGIN_FAILED'
    const response = NextResponse.redirect(new URL('/?casdoor_login=' + encodeURIComponent(code), config.origin), { headers })
    challengeCookie(response, '', 0)
    return response
  }
}
