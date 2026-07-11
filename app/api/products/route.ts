import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const denied = await requireResourcePermission('materials', 'read')
    if (denied) return denied

    const products = await prisma.product.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
        category: true,
        unit: true,
      },
    })
    return NextResponse.json({ data: products })
  } catch (error) {
    console.error('Get products error:', error)
    return NextResponse.json({ error: '获取产品列表失败' }, { status: 500 })
  }
}
