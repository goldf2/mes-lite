import { NextRequest, NextResponse } from 'next/server'
import { setSessionCookie } from '@/lib/auth'
import { AuthenticationError } from '@/modules/identity-access/domain/authentication'
import { resolveWeChatOperator, startOperatorSession } from '@/modules/identity-access/server/authentication-service'
import { WECHAT_STATE_COOKIE, buildAuthPageUrl, getWeChatWebConfig, getWeChatWebProfile } from '@/lib/wechatAuth'

function redirectWithStatus(req: NextRequest, status?: string) {
  const response = NextResponse.redirect(buildAuthPageUrl(req, status))
  response.cookies.set(WECHAT_STATE_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return response
}

function operatorStatusKey(error: AuthenticationError) {
  if (error.message.includes('待审核')) return 'pending'
  if (error.message.includes('未通过')) return 'rejected'
  if (error.message.includes('停用')) return 'disabled'
  return 'failed'
}

export async function GET(req: NextRequest) {
  const config = getWeChatWebConfig()
  if (!config) return redirectWithStatus(req, 'not_configured')
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const expectedState = req.cookies.get(WECHAT_STATE_COOKIE)?.value
  if (!code) return redirectWithStatus(req, 'missing_code')
  if (!state || !expectedState || state !== expectedState) return redirectWithStatus(req, 'state_invalid')
  try {
    const { operator } = await resolveWeChatOperator(await getWeChatWebProfile(config, code))
    const session = await startOperatorSession(operator)
    const response = redirectWithStatus(req)
    setSessionCookie(response, session.token, session.expiresAt)
    return response
  } catch (error) {
    if (error instanceof AuthenticationError) return redirectWithStatus(req, operatorStatusKey(error))
    console.error('WeChat login callback error:', error)
    return redirectWithStatus(req, 'failed')
  }
}
