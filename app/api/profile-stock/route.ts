import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const allowedStatuses = new Set([
  'AVAILABLE',
  'RESERVED',
  'CONSUMED',
  'REMNANT',
  'SCRAPPED',
  'SPLIT',
  'REVERSED',
])

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('profileStock', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const keyword = searchParams.get('keyword')?.trim()
    const materialId = searchParams.get('materialId')?.trim()
    const minLengthRaw = searchParams.get('minLength')?.trim()
    const maxLengthRaw = searchParams.get('maxLength')?.trim()
    const minLength = minLengthRaw ? Number(minLengthRaw) : null
    const maxLength = maxLengthRaw ? Number(maxLengthRaw) : null
    const location = searchParams.get('location')?.trim()
    const isRemnant = searchParams.get('isRemnant')
    const statuses = (searchParams.get('statuses') || '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => allowedStatuses.has(value))
    const page = Math.max(1, Number(searchParams.get('page') || 1))
    const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize') || 50)))

    const where: any = {}
    if (materialId) where.materialId = materialId
    if (statuses.length > 0) where.status = { in: statuses }
    if ((minLength !== null && Number.isFinite(minLength)) || (maxLength !== null && Number.isFinite(maxLength))) {
      where.actualLengthMm = {}
      if (minLength !== null && Number.isFinite(minLength)) where.actualLengthMm.gte = minLength
      if (maxLength !== null && Number.isFinite(maxLength)) where.actualLengthMm.lte = maxLength
    }
    if (location) where.location = { contains: location }
    if (isRemnant === '1') where.isRemnant = true
    if (isRemnant === '0') where.isRemnant = false
    if (keyword) {
      where.OR = [
        { entityNo: { contains: keyword } },
        { batchNo: { contains: keyword } },
        { location: { contains: keyword } },
        { material: { is: { code: { contains: keyword } } } },
        { material: { is: { name: { contains: keyword } } } },
        { material: { is: { spec: { contains: keyword } } } },
        { materialIn: { is: { inboundNo: { contains: keyword } } } },
        { supplier: { is: { name: { contains: keyword } } } },
      ]
    }

    const [items, total, availableEntities] = await Promise.all([
      prisma.profileStockEntity.findMany({
        where,
        include: {
          material: {
            select: {
              id: true,
              code: true,
              name: true,
              spec: true,
              stockUnit: true,
              valuationUnit: true,
              profileSpec: true,
              stock: { select: { qty: true, availableQty: true } },
            },
          },
          materialIn: { select: { id: true, inboundNo: true } },
          supplier: { select: { id: true, code: true, name: true } },
          parentEntity: { select: { id: true, entityNo: true } },
          _count: { select: { movements: true, childEntities: true } },
        },
        orderBy: [{ actualLengthMm: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.profileStockEntity.count({ where }),
      prisma.profileStockEntity.findMany({
        where: { ...where, availableQty: { gt: 0 } },
        select: {
          availableQty: true,
          quantity: true,
          unitWeightKg: true,
          totalWeightKg: true,
        },
      }),
    ])
    const availableWeight = (entity: {
      availableQty: number
      quantity: number
      unitWeightKg: number | null
      totalWeightKg: number | null
    }) => {
      if (entity.unitWeightKg !== null) return Number(entity.unitWeightKg) * entity.availableQty
      if (entity.totalWeightKg !== null && entity.quantity > 0) {
        return Number(entity.totalWeightKg) * entity.availableQty / entity.quantity
      }
      return 0
    }
    const data = items.map((entity) => ({
      ...entity,
      availableWeightKg: availableWeight(entity),
    }))

    return NextResponse.json({
      data,
      summary: {
        availableQty: availableEntities.reduce((sum, entity) => sum + entity.availableQty, 0),
        availableWeightKg: availableEntities.reduce((sum, entity) => sum + availableWeight(entity), 0),
      },
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    console.error('Get profile stock error:', error)
    return NextResponse.json({ error: '获取型材实体库存失败' }, { status: 500 })
  }
}
