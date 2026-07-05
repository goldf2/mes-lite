import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createMaterialInSchema = z.object({
  supplierId: z.string().min(1, '供应商必填'),
  materialId: z.string().min(1, '物料必填'),
  qty: z.number().positive('数量必须大于 0'),
  unit: z.string().min(1, '单位必填'),
  unitPrice: z.number().nonnegative('单价不能为负'),
  batchNo: z.string().optional(),
  receivedBy: z.string().optional(),
  note: z.string().optional(),
})

// GET: 来料单列表，支持 status 筛选和分页
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const page = Number(searchParams.get('page') ?? '1')
    const pageSize = Number(searchParams.get('pageSize') ?? '20')

    const where = status ? { status: status as any } : {}

    const [items, total] = await Promise.all([
      prisma.materialIn.findMany({
        where,
        include: {
          supplier: true,
          material: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.materialIn.count({ where }),
    ])

    return NextResponse.json({
      data: items,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    console.error('Get material-ins error:', error)
    return NextResponse.json({ error: '获取来料单列表失败' }, { status: 500 })
  }
}

// POST: 创建来料单
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { supplierId, materialId, qty, unit, unitPrice, batchNo, receivedBy, note } =
      createMaterialInSchema.parse(body)

    // 校验供应商存在
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } })
    if (!supplier) {
      return NextResponse.json({ error: '供应商不存在' }, { status: 404 })
    }

    // 校验物料存在
    const material = await prisma.material.findUnique({ where: { id: materialId } })
    if (!material) {
      return NextResponse.json({ error: '物料不存在' }, { status: 404 })
    }

    // 生成 inboundNo: IN-YYYYMMDD-XXX
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const count = await prisma.materialIn.count({
      where: { createdAt: { gte: new Date(today.setHours(0, 0, 0, 0)) } },
    })
    const inboundNo = `IN-${dateStr}-${String(count + 1).padStart(3, '0')}`

    const totalAmount = qty * unitPrice

    const materialIn = await prisma.materialIn.create({
      data: {
        inboundNo,
        supplierId,
        materialId,
        qty,
        unit,
        unitPrice,
        totalAmount,
        batchNo,
        receivedBy,
        note,
        status: 'PENDING',
      },
      include: {
        supplier: true,
        material: true,
      },
    })

    return NextResponse.json({ data: materialIn }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Create material-in error:', error)
    return NextResponse.json({ error: '创建来料单失败' }, { status: 500 })
  }
}
