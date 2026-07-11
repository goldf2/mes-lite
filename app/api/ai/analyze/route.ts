import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('orders', 'read')
    if (denied) return denied

    return NextResponse.json({
      error: 'AI 分析功能暂未启用',
    }, { status: 501 })
  } catch (error) {
    console.error('AI analyze error:', error)
    return NextResponse.json({ error: 'AI 分析失败' }, { status: 500 })
  }
}
