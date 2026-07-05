import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const materialSchema = z.object({
  code: z.string().min(1, '物料编码不能为空'),
  name: z.string().min(1, '物料名称不能为空'),
  spec: z.string().optional(),
  unit: z.string().min(1, '单位不能为空'),
})

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const keyword = searchParams.get('keyword')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    const where = keyword
      ? {
          OR: [
            { name: { contains: keyword } },
            { code: { contains: keyword } },
          ],
        }
      : {}

    const [materials, total] = await Promise.all([
      prisma.material.findMany({
        where,
        include: {
          stock: { select: { qty: true, reservedQty: true, availableQty: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.material.count({ where }),
    ])

    return NextResponse.json({
      data: materials,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Get materials error:', error)
    return NextResponse.json({ error: '获取物料列表失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const result = materialSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: '参数错误', details: result.error.errors },
        { status: 400 }
      )
    }

    const existing = await prisma.material.findUnique({
      where: { code: body.code },
    })

    if (existing) {
      return NextResponse.json({ error: '物料编码已存在' }, { status: 400 })
    }

    const material = await prisma.material.create({
      data: {
        code: body.code,
        name: body.name,
        spec: body.spec || '',
        unit: body.unit,
      },
    })

    return NextResponse.json({ data: material }, { status: 201 })
  } catch (error) {
    console.error('Create material error:', error)
    return NextResponse.json({ error: '创建物料失败' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const result = z
      .object({
        id: z.string().min(1),
        code: z.string().min(1),
        name: z.string().min(1),
        spec: z.string().optional(),
        unit: z.string().min(1),
      })
      .safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: '参数错误', details: result.error.errors },
        { status: 400 }
      )
    }

    const existing = await prisma.material.findUnique({
      where: { code: body.code },
    })

    if (existing && existing.id !== body.id) {
      return NextResponse.json({ error: '物料编码已存在' }, { status: 400 })
    }

    const material = await prisma.material.update({
      where: { id: body.id },
      data: {
        code: body.code,
        name: body.name,
        spec: body.spec || '',
        unit: body.unit,
      },
    })

    return NextResponse.json({ data: material })
  } catch (error) {
    console.error('Update material error:', error)
    return NextResponse.json({ error: '更新物料失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: '物料ID不能为空' }, { status: 400 })
    }

    const hasBOMItems = await prisma.bOMItem.count({ where: { materialId: id } })
    if (hasBOMItems > 0) {
      return NextResponse.json({ error: '该物料已被BOM使用，无法删除' }, { status: 400 })
    }

    const hasPickItems = await prisma.pickItem.count({ where: { materialId: id } })
    if (hasPickItems > 0) {
      return NextResponse.json({ error: '该物料已被领料单使用，无法删除' }, { status: 400 })
    }

    const hasMaterialIns = await prisma.materialIn.count({ where: { materialId: id } })
    if (hasMaterialIns > 0) {
      return NextResponse.json({ error: '该物料已有来料记录，无法删除' }, { status: 400 })
    }

    await prisma.material.delete({ where: { id } })

    return NextResponse.json({ success: true, message: '删除成功' })
  } catch (error) {
    console.error('Delete material error:', error)
    return NextResponse.json({ error: '删除物料失败' }, { status: 500 })
  }
}
