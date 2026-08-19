import { NextRequest, NextResponse } from 'next/server'
import {
  configuredTrustedOrigins,
  isTrustedWriteRequestOrigin,
  resolveRequestOrigin,
} from '@/modules/identity-access/domain/request-origin-policy'

const SESSION_COOKIE = 'mes_lite_session'

function withFramePolicy(response: NextResponse) {
  const frameSources = [
    "'self'",
    'https://player.bilibili.com',
    'https://www.youtube-nocookie.com',
  ]
  const collaboraUrl = process.env.COLLABORA_PUBLIC_URL?.trim()
  if (collaboraUrl) {
    try {
      frameSources.push(new URL(collaboraUrl).origin)
    } catch {
      // 配置错误由查看会话接口返回明确错误，不能阻断整个应用页面。
    }
  }
  response.headers.set('Content-Security-Policy', `frame-src ${frameSources.join(' ')};`)
  return response
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname.startsWith('/uploads/')) {
    return NextResponse.json({ error: '附件必须通过授权接口访问' }, { status: 404 })
  }
  if (!pathname.startsWith('/api')) return withFramePolicy(NextResponse.next())
  if (!isTrustedWriteRequestOrigin({
    method: req.method,
    requestOrigin: resolveRequestOrigin({
      fallbackOrigin: req.nextUrl.origin,
      forwardedHost: req.headers.get('x-forwarded-host'),
      forwardedProto: req.headers.get('x-forwarded-proto'),
    }),
    origin: req.headers.get('origin'),
    trustedOrigins: [req.nextUrl.origin, ...configuredTrustedOrigins()],
  })) {
    return NextResponse.json({ error: '写请求来源无效' }, { status: 403 })
  }
  if (pathname.startsWith('/api/auth')) return NextResponse.next()
  if (pathname === '/api/health' || pathname.startsWith('/api/health/')) return NextResponse.next()
  if (pathname.startsWith('/api/wopi/')) return NextResponse.next()

  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/api/:path*',
    '/uploads/:path*',
    '/((?!api|uploads|_next/static|_next/image|favicon.ico|icon.svg).*)',
  ],
}
