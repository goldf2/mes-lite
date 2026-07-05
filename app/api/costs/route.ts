import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createCostSchema = z.object({
  orderId: z.string().optional().nullable(),
  costType: z.enum(['MATERIAL', 'LABOR', 'EQUIPMENT', 'OVERHEAD', 'OTHER']),
  category: z.string().min(1),
  amount: z.number().nonnegative(),
  description: z.string().optional(),
  date: z.string().min(1),
  createdBy: z.string().optional(),
})

// GET: 成本记录列表
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const costType = searchParams.get('costType')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const page = Number(searchParams.get('page') ?? '1')
    const pageSize = Number(searchParams.get('pageSize') ?? '20')

    const where: any = {}
    if (costType) where.costType = costType
    if (startDate || endDate) {
      where.date = {}
      if (startDate) where.date.gte = new Date(startDate)
      if (endDate) where.date.lte = new Date(endDate)
    }

    const [records, total] = await Promise.all([
      prisma.costRecord.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              orderNo: true,
              product: { select: { id: true, name: true, sku: true } },
            },
          },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.costRecord.count({ where }),
    ])

    return NextResponse.json({
      data: records,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    console.error('Get costs error:', error)
    return NextResponse.json({ error: '获取成本列表失败' }, { status: 500 })
  }
}

// POST: 新增成本记录
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createCostSchema.parse(body)

    const record = await prisma.costRecord.create({
      data: {
        orderId: data.orderId ?? null,
        costType: data.costType,
        category: data.category,
        amount: data.amount,
        description: data.description,
        date: new Date(data.date),
        createdBy: data.createdBy,
      },
      include: {
        order: {
          select: {
            id: true,
            orderNo: true,
            product: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    })

    return NextResponse.json({ data: record }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Create cost error:', error)
    return NextResponse.json({ error: '创建成本记录失败' }, { status: 500 })
  }
}
