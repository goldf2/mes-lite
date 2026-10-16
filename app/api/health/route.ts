import { NextResponse } from 'next/server'
import { ensureAuthenticationRuntime } from '@/modules/identity-access/server/authentication-runtime-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const runtime = await ensureAuthenticationRuntime()
    if (!runtime.ready) throw new Error('LOGIN_CONFIGURATION_REQUIRED')
  } catch {
    return NextResponse.json({ status: 'unavailable', service: 'mes-lite', authReady: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  return NextResponse.json({
    status: 'ok',
    service: 'mes-lite',
    timestamp: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
