import { NextRequest, NextResponse } from 'next/server'
import { getAuditContext, writeAuditLogWithContext } from '@/lib/audit'
import { setSessionCookie } from '@/lib/auth'
import { CasdoorLoginError, parseCasdoorCallbackOrigin, readLoginConfiguration, requireCasdoorCallbackOrigin } from '../domain/casdoor-runtime'
import { resolveRequestOrigin } from '../domain/request-origin-policy'
import { beginCasdoorLogin, completeCasdoorLogin, CASDOOR_CHALLENGE_COOKIE } from '../server/casdoor-login-service'
import { enforceAuthenticationRequestLimit } from './authentication-request'

const headers = { 'Cache-Control': 'no-store' }
function publicRequestOrigin(request: NextRequest) {
  const config = readLoginConfiguration()
  if (!config.origin || !config.ready) throw new CasdoorLoginError('CASDOOR_UNAVAILABLE')
  const fallback = new URL(request.url)
  const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? fallback.host).split(',')[0].trim()
  const protocol = (request.headers.get('x-forwarded-proto') ?? fallback.protocol.slice(0, -1)).split(',')[0].trim().toLowerCase()
  // The shared resolver has a permissive fallback; authentication must reject malformed proxy headers instead.
  if (!parseCasdoorCallbackOrigin(protocol + '://' + host)) throw new CasdoorLoginError('INVALID_CALLBACK_ORIGIN', 403)
  return requireCasdoorCallbackOrigin(config, resolveRequestOrigin({ fallbackOrigin: fallback.origin, forwardedHost: host, forwardedProto: protocol }))
}
function challengeCookie(response: NextResponse, value: string, maxAge: number) {
  response.cookies.set(CASDOOR_CHALLENGE_COOKIE, value, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge })
}
export async function casdoorLoginGet(request: NextRequest) {
  try {
    const origin = publicRequestOrigin(request)
    await enforceAuthenticationRequestLimit(request, 'LOGIN')
    const login = await beginCasdoorLogin(request.nextUrl.searchParams.get('next'), {}, origin)
    const response = NextResponse.redirect(login.authorizationUrl, { headers })
    challengeCookie(response, login.ticket, 300)
    return response
  } catch (error) {
    return NextResponse.json({ error: error instanceof CasdoorLoginError ? error.code : 'CASDOOR_UNAVAILABLE' }, { status: error instanceof CasdoorLoginError ? error.status : 503, headers })
  }
}
export async function casdoorCallbackGet(request: NextRequest) {
  let origin: string | null = null
  try {
    origin = publicRequestOrigin(request)
    const result = await completeCasdoorLogin(request.url, request.cookies.get(CASDOOR_CHALLENGE_COOKIE)?.value || '', {}, origin)
    await writeAuditLogWithContext({ ...await getAuditContext(request), operatorId: result.operatorId, operatorName: result.operatorName }, {
      action: 'LOGIN', entityType: 'OPERATOR', entityId: result.operatorId, entityLabel: result.operatorUsername,
      afterData: { authSource: 'casdoor' },
    })
    const response = NextResponse.redirect(new URL(result.next, origin), { headers })
    challengeCookie(response, '', 0)
    setSessionCookie(response, result.session.token, result.session.expiresAt)
    return response
  } catch (error) {
    const code = error instanceof CasdoorLoginError ? error.code : 'CASDOOR_LOGIN_FAILED'
    if (!origin) return NextResponse.json({ error: code }, { status: error instanceof CasdoorLoginError ? error.status : 503, headers })
    const response = NextResponse.redirect(new URL('/?casdoor_login=' + encodeURIComponent(code), origin), { headers })
    challengeCookie(response, '', 0)
    return response
  }
}
