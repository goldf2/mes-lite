import { NextRequest, NextResponse } from 'next/server'
import {
  WECHAT_STATE_COOKIE,
  buildAuthPageUrl,
  buildWeChatAuthorizeUrl,
  createWeChatState,
  getWeChatRedirectUri,
  getWeChatWebConfig,
} from '@/lib/wechatAuth'
import { authenticationHttpError } from '@/modules/identity-access/http/authentication-http'
import { enforceAuthenticationRequestLimit } from '@/modules/identity-access/http/authentication-request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    await enforceAuthenticationRequestLimit(req, 'LOGIN')
  } catch (error) {
    return authenticationHttpError(error, '微信登录请求失败')
  }
  const config = getWeChatWebConfig()
  if (!config) {
    return NextResponse.redirect(buildAuthPageUrl(req, 'not_configured'))
  }

  const state = createWeChatState()
  const redirectUri = getWeChatRedirectUri(req, config)
  const res = NextResponse.redirect(buildWeChatAuthorizeUrl(config, redirectUri, state))

  res.cookies.set(WECHAT_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  })

  return res
}
