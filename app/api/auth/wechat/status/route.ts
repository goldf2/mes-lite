import { NextResponse } from 'next/server'
import { getWeChatWebConfig } from '@/lib/wechatAuth'

export async function GET() {
  return NextResponse.json({
    data: {
      enabled: Boolean(getWeChatWebConfig()),
    },
  })
}
