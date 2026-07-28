import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { materialAsProductOption } from '@/lib/material-product'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materials', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const customerId = searchParams.get('customerId')
    const where: any = {}
    if (customerId === '__UNASSIGNED__') where.customerId = null
    else if (customerId) where.customerId = customerId

    const materials = await prisma.material.findMany({
      where: { deletedAt: null, ...where },
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        customerId: true,
        customer: { select: { id: true, code: true, name: true } },
        spec: true,
        unit: true,
        stockUnit: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ data: materials.map(materialAsProductOption) })
  } catch (error) {
    console.error('Get product-compatible materials error:', error)
    return NextResponse.json({ error: '获取物料列表失败' }, { status: 500 })
  }
}
