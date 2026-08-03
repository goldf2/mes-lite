import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const denied = await requireResourcePermission('orders', 'create')
    if (denied) return denied

    const boms = await prisma.bOM.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        version: true,
        isDefault: true,
        outputs: {
          where: { isPrimary: true },
          select: {
            material: {
              select: {
                id: true,
                code: true,
                name: true,
                spec: true,
                category: true,
                unit: true,
                stockUnit: true,
                valuationUnit: true,
              },
            },
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
    })

    const byMaterial = new Map<string, {
      id: string
      code: string
      name: string
      spec: string | null
      category: string
      unit: string
      stockUnit: string
      valuationUnit: string
      boms: Array<{ id: string; name: string; version: string; isDefault: boolean }>
    }>()

    for (const bom of boms) {
      const material = bom.outputs[0]?.material
      if (!material) continue
      const current = byMaterial.get(material.id) || { ...material, boms: [] }
      current.boms.push({ id: bom.id, name: bom.name, version: bom.version, isDefault: bom.isDefault })
      byMaterial.set(material.id, current)
    }

    return NextResponse.json({
      data: Array.from(byMaterial.values()).sort((left, right) => left.code.localeCompare(right.code, 'zh-CN', { numeric: true })),
    })
  } catch (error) {
    console.error('Get production order options error:', error)
    return NextResponse.json({ error: '获取生产订单选项失败' }, { status: 500 })
  }
}
