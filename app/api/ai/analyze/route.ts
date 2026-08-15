import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'

export async function POST(req: NextRequest) {
  try {
    // audit-exempt: 该兼容接口固定返回 501，不执行任何状态写入。
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
