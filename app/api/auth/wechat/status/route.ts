import { NextResponse } from 'next/server'
import { getWeChatWebConfig } from '@/lib/wechatAuth'
import { readLoginConfiguration } from '@/modules/identity-access/domain/casdoor-runtime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    data: {
      enabled: readLoginConfiguration().mode === 'builtin' && Boolean(getWeChatWebConfig()),
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
