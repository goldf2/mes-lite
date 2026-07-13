import { NextRequest, NextResponse } from 'next/server'
import {
  WECHAT_STATE_COOKIE,
  buildAuthPageUrl,
  buildWeChatAuthorizeUrl,
  createWeChatState,
  getWeChatRedirectUri,
  getWeChatWebConfig,
} from '@/lib/wechatAuth'

export async function GET(req: NextRequest) {
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
    path: '/',
    maxAge: 10 * 60,
  })

  return res
}
