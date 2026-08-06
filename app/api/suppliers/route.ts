import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { randomUUID } from 'crypto'
import { nextConfigurationSortOrder } from '@/lib/configuration-order'
import { tokenizeKeywordQuery } from '@/lib/resource-search'

const createSupplierSchema = z.object({
  name: z.string().min(1, '供应商名称必填'),
  contact: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
})

const updateSupplierSchema = createSupplierSchema.extend({
  id: z.string().min(1, '供应商 ID 必填'),
})

// GET: 供应商列表，支持 keyword 搜索
export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const keyword = searchParams.get('keyword')

    const where: any = { deletedAt: null }
    const keywordFilters = tokenizeKeywordQuery(keyword || '').map((token) => ({ OR: [
      { name: { contains: token } },
      { code: { contains: token } },
      { contact: { contains: token } },
      { phone: { contains: token } },
      { address: { contains: token } },
    ] }))
    if (keywordFilters.length > 0) where.AND = keywordFilters

    const suppliers = await prisma.supplier.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })

    return NextResponse.json({ data: suppliers })
  } catch (error) {
    console.error('Get suppliers error:', error)
    return NextResponse.json({ error: '获取供应商列表失败' }, { status: 500 })
  }
}

// POST: 新增供应商
export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'create')
    if (denied) return denied

    const body = await req.json()
    const { name, contact, phone, address } = createSupplierSchema.parse(body)
    const code = `SUP-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`

    const supplier = await prisma.$transaction(async (tx) => tx.supplier.create({
      data: {
        code,
        name,
        contact,
        phone,
        address,
        sortOrder: await nextConfigurationSortOrder(tx, 'suppliers'),
      },
    }))

    return NextResponse.json({ data: supplier }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Create supplier error:', error)
    return NextResponse.json({ error: '创建供应商失败' }, { status: 500 })
  }
}

// PUT: 编辑供应商
export async function PUT(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'update')
    if (denied) return denied

    const body = await req.json()
    const { id, name, contact, phone, address } = updateSupplierSchema.parse(body)

    const supplier = await prisma.supplier.findUnique({ where: { id } })
    if (!supplier || supplier.deletedAt) {
      return NextResponse.json({ error: '供应商不存在' }, { status: 404 })
    }

    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        name,
        contact: contact || null,
        phone: phone || null,
        address: address || null,
      },
    })

    return NextResponse.json({ data: updated })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Update supplier error:', error)
    return NextResponse.json({ error: '更新供应商失败' }, { status: 500 })
  }
}

// DELETE: 归档供应商，历史来料记录继续保留引用。
export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'delete')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: '缺少供应商 ID' }, { status: 400 })
    }

    const supplier = await prisma.supplier.findUnique({ where: { id } })
    if (!supplier || supplier.deletedAt) {
      return NextResponse.json({ error: '供应商不存在或已归档' }, { status: 404 })
    }

    const archived = await prisma.supplier.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    })

    await writeAuditLog(req, {
      action: 'ARCHIVE',
      entityType: 'SUPPLIER',
      entityId: archived.id,
      entityLabel: archived.name,
      beforeData: supplier,
      afterData: archived,
    })

    return NextResponse.json({ success: true, message: '供应商已归档，可在归档记录中恢复' })
  } catch (error) {
    console.error('Archive supplier error:', error)
    return NextResponse.json({ error: '归档供应商失败' }, { status: 500 })
  }
}
