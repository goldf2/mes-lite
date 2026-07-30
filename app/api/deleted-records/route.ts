import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { ArchivedRecordPurgeError, purgeArchivedRecord } from '@/lib/archived-record-purge'

export const dynamic = 'force-dynamic'

const purgeSchema = z.object({
  model: z.enum(['material', 'supplier', 'customer', 'materialIn', 'workInstruction', 'order', 'dispatch', 'shipment', 'return']),
  id: z.string().min(1),
  confirmation: z.literal('永久删除'),
})

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const model = searchParams.get('model') || 'all'

    const result: Record<string, unknown[]> = {}

    if (model === 'all' || model === 'material') {
      result.materials = await prisma.material.findMany({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
      })
    }
    if (model === 'all' || model === 'supplier') {
      result.suppliers = await prisma.supplier.findMany({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
      })
    }
    if (model === 'all' || model === 'customer') {
      result.customers = await prisma.customer.findMany({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
      })
    }
    if (model === 'all' || model === 'materialIn') {
      result.materialIn = await prisma.materialIn.findMany({
        where: { deletedAt: { not: null } },
        include: { supplier: true, material: true },
        orderBy: { deletedAt: 'desc' },
      })
    }
    if (model === 'all' || model === 'workInstruction') {
      result.workInstructions = await prisma.workInstruction.findMany({
        where: { deletedAt: { not: null } },
        include: { material: true, customer: true },
        orderBy: { deletedAt: 'desc' },
      })
    }
    if (model === 'all' || model === 'order') {
      result.orders = await prisma.productionOrder.findMany({
        where: { deletedAt: { not: null } },
        include: { product: true },
        orderBy: { deletedAt: 'desc' },
      })
    }
    if (model === 'all' || model === 'dispatch') {
      result.dispatches = await prisma.dispatch.findMany({
        where: { deletedAt: { not: null } },
        include: { order: true, step: true },
        orderBy: { deletedAt: 'desc' },
      })
    }
    if (model === 'all' || model === 'shipment') {
      result.shipments = await prisma.shipment.findMany({
        where: { deletedAt: { not: null } },
        include: { product: true },
        orderBy: { deletedAt: 'desc' },
      })
    }
    if (model === 'all' || model === 'return') {
      result.returns = await prisma.returnOrder.findMany({
        where: { deletedAt: { not: null } },
        include: { product: true },
        orderBy: { deletedAt: 'desc' },
      })
    }

    return NextResponse.json({ data: result })
  } catch (error) {
    console.error('Get archived records error:', error)
    return NextResponse.json({ error: '获取归档记录失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'delete')
    if (denied) return denied

    const input = purgeSchema.safeParse(await req.json())
    if (!input.success) {
      return NextResponse.json({ error: '参数错误', details: input.error.errors }, { status: 400 })
    }

    const result = await purgeArchivedRecord(input.data.model, input.data.id)
    await writeAuditLog(req, {
      action: 'PURGE',
      entityType: result.entityType,
      entityId: result.id,
      entityLabel: result.entityLabel,
      beforeData: result.snapshot,
      note: '从归档记录永久删除；此操作不可恢复',
    })

    return NextResponse.json({ message: '归档记录已永久删除' })
  } catch (error) {
    if (error instanceof ArchivedRecordPurgeError) {
      return NextResponse.json({
        error: error.blockers.length > 0
          ? `${error.message}：${error.blockers.join('；')}`
          : error.message,
        blockers: error.blockers,
      }, { status: error.status })
    }
    console.error('Purge archived record error:', error)
    return NextResponse.json({ error: '永久删除归档记录失败' }, { status: 500 })
  }
}
