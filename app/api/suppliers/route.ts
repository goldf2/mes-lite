import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

const createSupplierSchema = z.object({
  code: z.string().min(1, '供应商编码必填'),
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
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
        { contact: { contains: keyword } },
        { phone: { contains: keyword } },
      ]
    }

    const suppliers = await prisma.supplier.findMany({
      where,
      orderBy: { createdAt: 'desc' },
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
    const { code, name, contact, phone, address } = createSupplierSchema.parse(body)

    const existing = await prisma.supplier.findUnique({ where: { code } })
    if (existing) {
      return NextResponse.json({ error: existing.deletedAt ? '供应商编码已被已归档记录占用' : '供应商编码已存在' }, { status: 400 })
    }

    const supplier = await prisma.supplier.create({
      data: { code, name, contact, phone, address },
    })

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
    const { id, code, name, contact, phone, address } = updateSupplierSchema.parse(body)

    const supplier = await prisma.supplier.findUnique({ where: { id } })
    if (!supplier || supplier.deletedAt) {
      return NextResponse.json({ error: '供应商不存在' }, { status: 404 })
    }

    const existing = await prisma.supplier.findUnique({ where: { code } })
    if (existing && existing.id !== id) {
      return NextResponse.json({ error: existing.deletedAt ? '供应商编码已被已归档记录占用' : '供应商编码已存在' }, { status: 400 })
    }

    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        code,
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
      entityLabel: archived.code,
      beforeData: supplier,
      afterData: archived,
    })

    return NextResponse.json({ success: true, message: '供应商已归档，可在归档记录中恢复' })
  } catch (error) {
    console.error('Archive supplier error:', error)
    return NextResponse.json({ error: '归档供应商失败' }, { status: 500 })
  }
}
