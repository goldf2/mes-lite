import { NextResponse } from 'next/server'
import { getWeChatWebConfig } from '@/lib/wechatAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    data: {
      enabled: Boolean(getWeChatWebConfig()),
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
