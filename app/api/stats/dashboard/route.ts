import { NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { getDashboardData } from '@/modules/workspace/server/dashboard-query-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const denied = await requireResourcePermission('dashboard', 'read')
    if (denied) return denied

    return NextResponse.json({ data: await getDashboardData() })
  } catch (error) {
    console.error('Get dashboard error:', error)
    return NextResponse.json({ error: '获取仪表盘数据失败' }, { status: 500 })
  }
}
