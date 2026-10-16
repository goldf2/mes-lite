import { NextResponse } from 'next/server'
import { ensureAuthenticationRuntime } from '@/modules/identity-access/server/authentication-runtime-service'
import { evaluateRuntimeReadiness } from '@/modules/operations-tools/server/runtime-readiness-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const readiness = await evaluateRuntimeReadiness()
  try {
    const authentication = await ensureAuthenticationRuntime()
    readiness.checks.authentication = authentication.ready
      ? { status: 'pass', message: '登录方式配置就绪' }
      : { status: 'fail', message: '登录方式配置未就绪' }
  } catch {
    readiness.checks.authentication = { status: 'fail', message: '无法确认登录方式配置' }
  }
  readiness.status = Object.values(readiness.checks).some(check => check.status === 'fail') ? 'unready' : 'ready'
  return NextResponse.json({
    ...readiness,
    service: 'mes-lite',
    timestamp: new Date().toISOString(),
  }, {
    status: readiness.status === 'ready' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
