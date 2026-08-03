import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { createInternalCode } from '@/lib/internal-codes'
import { nextConfigurationSortOrder } from '@/lib/configuration-order'

const customerSchema = z.object({
  name: z.string().min(1, '客户名称必填'),
  contact: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
})

const updateCustomerSchema = customerSchema.extend({
  id: z.string().min(1, '客户 ID 必填'),
})

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
        { contact: { contains: keyword } },
        { phone: { contains: keyword } },
      ]
    }

    const customers = await prisma.customer.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })

    return NextResponse.json({ data: customers })
  } catch (error) {
    console.error('Get customers error:', error)
    return NextResponse.json({ error: '获取客户列表失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'create')
    if (denied) return denied

    const body = await req.json()
    const { name, contact, phone, address } = customerSchema.parse(body)

    const existing = await prisma.customer.findFirst({ where: { name, deletedAt: null } })
    if (existing) {
      return NextResponse.json({ error: '客户名称已存在' }, { status: 400 })
    }

    const customer = await prisma.$transaction(async (tx) => tx.customer.create({
      data: {
        code: createInternalCode('cus'),
        name,
        contact: contact || null,
        phone: phone || null,
        address: address || null,
        sortOrder: await nextConfigurationSortOrder(tx, 'customers'),
      },
    }))

    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'CUSTOMER',
      entityId: customer.id,
      entityLabel: customer.code,
      afterData: customer,
    })

    return NextResponse.json({ data: customer }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Create customer error:', error)
    return NextResponse.json({ error: '创建客户失败' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'update')
    if (denied) return denied

    const body = await req.json()
    const { id, name, contact, phone, address } = updateCustomerSchema.parse(body)

    const customer = await prisma.customer.findUnique({ where: { id } })
    if (!customer || customer.deletedAt) {
      return NextResponse.json({ error: '客户不存在' }, { status: 404 })
    }

    const existing = await prisma.customer.findFirst({ where: { name, deletedAt: null, id: { not: id } } })
    if (existing) {
      return NextResponse.json({ error: '客户名称已存在' }, { status: 400 })
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        name,
        contact: contact || null,
        phone: phone || null,
        address: address || null,
      },
    })

    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'CUSTOMER',
      entityId: updated.id,
      entityLabel: updated.code,
      beforeData: customer,
      afterData: updated,
    })

    return NextResponse.json({ data: updated })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Update customer error:', error)
    return NextResponse.json({ error: '更新客户失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'delete')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: '缺少客户 ID' }, { status: 400 })
    }

    const customer = await prisma.customer.findUnique({ where: { id } })
    if (!customer || customer.deletedAt) {
      return NextResponse.json({ error: '客户不存在或已归档' }, { status: 404 })
    }

    const archived = await prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await writeAuditLog(req, {
      action: 'ARCHIVE',
      entityType: 'CUSTOMER',
      entityId: archived.id,
      entityLabel: archived.code,
      beforeData: customer,
      afterData: archived,
    })

    return NextResponse.json({ success: true, message: '客户已归档，可在归档记录中恢复' })
  } catch (error) {
    console.error('Archive customer error:', error)
    return NextResponse.json({ error: '归档客户失败' }, { status: 500 })
  }
}
