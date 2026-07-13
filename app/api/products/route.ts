import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const productSchema = z.object({
  id: z.string().optional(),
  sku: z.string().min(1, '产品编码必填'),
  name: z.string().min(1, '产品名称必填'),
  category: z.string().min(1, '产品类别必填'),
  customerId: z.string().optional(),
  unit: z.string().min(1, '单位必填'),
  description: z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materials', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const customerId = searchParams.get('customerId')
    const where: any = {}
    if (customerId === '__UNASSIGNED__') where.customerId = null
    else if (customerId) where.customerId = customerId

    const products = await prisma.product.findMany({
      where,
      select: {
        id: true,
        sku: true,
        name: true,
        category: true,
        customerId: true,
        customer: { select: { id: true, code: true, name: true } },
        unit: true,
        description: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ data: products })
  } catch (error) {
    console.error('Get products error:', error)
    return NextResponse.json({ error: '获取产品列表失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'create')
    if (denied) return denied

    const body = await req.json()
    const data = productSchema.parse(body)

    const existing = await prisma.product.findUnique({ where: { sku: data.sku } })
    if (existing) {
      return NextResponse.json({ error: '产品编码已存在' }, { status: 400 })
    }

    const product = await prisma.product.create({
      data: {
        sku: data.sku,
        name: data.name,
        category: data.category,
        customerId: data.customerId || null,
        unit: data.unit,
        description: data.description || null,
      },
    })

    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'PRODUCT',
      entityId: product.id,
      entityLabel: product.sku,
      afterData: product,
    })

    return NextResponse.json({ data: product }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Create product error:', error)
    return NextResponse.json({ error: '创建产品失败' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'update')
    if (denied) return denied

    const body = await req.json()
    const data = productSchema.extend({ id: z.string().min(1, '缺少产品 ID') }).parse(body)

    const current = await prisma.product.findUnique({ where: { id: data.id } })
    if (!current) {
      return NextResponse.json({ error: '产品不存在' }, { status: 404 })
    }

    const existing = await prisma.product.findUnique({ where: { sku: data.sku } })
    if (existing && existing.id !== data.id) {
      return NextResponse.json({ error: '产品编码已存在' }, { status: 400 })
    }

    const product = await prisma.product.update({
      where: { id: data.id },
      data: {
        sku: data.sku,
        name: data.name,
        category: data.category,
        customerId: data.customerId || null,
        unit: data.unit,
        description: data.description || null,
      },
    })

    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'PRODUCT',
      entityId: product.id,
      entityLabel: product.sku,
      beforeData: current,
      afterData: product,
    })

    return NextResponse.json({ data: product, message: '产品已更新' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Update product error:', error)
    return NextResponse.json({ error: '更新产品失败' }, { status: 500 })
  }
}
