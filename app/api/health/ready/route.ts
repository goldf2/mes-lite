import { NextResponse } from 'next/server'
import { evaluateRuntimeReadiness } from '@/modules/operations-tools/server/runtime-readiness-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const readiness = await evaluateRuntimeReadiness()
  return NextResponse.json({
    ...readiness,
    service: 'mes-lite',
    timestamp: new Date().toISOString(),
  }, {
    status: readiness.status === 'ready' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
