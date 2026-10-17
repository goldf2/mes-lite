import { NextRequest, NextResponse } from 'next/server'
import { ensureAuthenticationRuntime } from '../server/authentication-runtime-service'
import {
  CASDOOR_HANDOFF_COOKIES, CASDOOR_HINT_COOKIES, CASDOOR_LOGOUT_STATE_COOKIE,
  casdoorLogoutConnection, casdoorLogoutForm, readCasdoorLogoutHandoff, validateCasdoorLogoutCallback,
} from '../server/casdoor-logout-service'

const headers = {'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'}
const options = () => ({httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/'})
export function clearCasdoorLogoutCookies(response: NextResponse, preserveState = false) {
  for (const name of [...CASDOOR_HINT_COOKIES, ...CASDOOR_HANDOFF_COOKIES, ...(preserveState ? [] : [CASDOOR_LOGOUT_STATE_COOKIE])]) response.cookies.set(name, '', {...options(), maxAge: 0})
}
export function setCasdoorLogoutHintCookies(response: NextResponse, parts: string[], expiresAt: Date) {
  clearCasdoorLogoutCookies(response)
  parts.forEach((value, index) => response.cookies.set(CASDOOR_HINT_COOKIES[index], value, {...options(), expires: expiresAt}))
}
export function setCasdoorLogoutHandoffCookies(response: NextResponse, handoff: {parts: string[]; stateCookie: string}) {
  clearCasdoorLogoutCookies(response)
  handoff.parts.forEach((value, index) => response.cookies.set(CASDOOR_HANDOFF_COOKIES[index], value, {...options(), maxAge: 120}))
  response.cookies.set(CASDOOR_LOGOUT_STATE_COOKIE, handoff.stateCookie, {...options(), maxAge: 120})
}
/** Cookie consumption is browser-local; no claim of globally single-use server storage. */
export async function casdoorLogoutGet(request: NextRequest) {
  try {
    const config = casdoorLogoutConnection(await ensureAuthenticationRuntime())
    if (!config || request.nextUrl.search) throw new Error('CASDOOR_LOGOUT_UNCONFIRMED')
    const form = casdoorLogoutForm(config, readCasdoorLogoutHandoff(config, request.cookies))
    const response = new NextResponse(form.html, {headers: {...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': form.csp}})
    clearCasdoorLogoutCookies(response, true)
    return response
  } catch {
    const response = NextResponse.json({error: 'CASDOOR_LOGOUT_UNCONFIRMED'}, {status: 409, headers})
    clearCasdoorLogoutCookies(response)
    return response
  }
}
export async function casdoorLogoutCallbackGet(request: NextRequest) {
  try {
    const config = casdoorLogoutConnection(await ensureAuthenticationRuntime())
    if (!config || !validateCasdoorLogoutCallback(config, request.cookies.get(CASDOOR_LOGOUT_STATE_COOKIE)?.value || '', request.nextUrl.searchParams)) throw new Error('CASDOOR_LOGOUT_UNCONFIRMED')
    const response = NextResponse.redirect(new URL('/?casdoor_login=PROVIDER_LOGOUT_COMPLETE', config.origin), {headers})
    clearCasdoorLogoutCookies(response)
    return response
  } catch {
    const response = NextResponse.json({error: 'CASDOOR_LOGOUT_UNCONFIRMED'}, {status: 409, headers})
    clearCasdoorLogoutCookies(response)
    return response
  }
}
