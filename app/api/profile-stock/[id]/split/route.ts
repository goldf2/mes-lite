import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentOperator } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { splitProfileBatchEntity } from '@/lib/profile-stock'

const splitSchema = z.object({
  quantity: z.number().int().positive('拆分数量必须为正整数'),
  clientRequestId: z.string().min(8, '缺少有效幂等键'),
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('profileStock', 'update')
    if (denied) return denied

    const input = splitSchema.parse(await req.json())
    const operator = await getCurrentOperator()
    const existingMovement = await prisma.profileStockMovement.findUnique({
      where: { idempotencyKey: `PROFILE_SPLIT:${input.clientRequestId}:PARENT` },
    })
    if (existingMovement) {
      const existingChildren = await prisma.profileStockEntity.findMany({
        where: { sourceType: 'PROFILE_ENTITY_SPLIT', sourceId: input.clientRequestId },
        orderBy: { entityNo: 'asc' },
      })
      return NextResponse.json({
        data: existingChildren,
        duplicate: true,
        message: `已拆分 ${existingChildren.length} 根单根实体`,
      })
    }
    const before = await prisma.profileStockEntity.findUnique({ where: { id: params.id } })
    if (!before) return NextResponse.json({ error: '型材实体不存在' }, { status: 404 })

    const children = await prisma.$transaction((tx) => splitProfileBatchEntity(tx, {
      entityId: params.id,
      quantity: input.quantity,
      clientRequestId: input.clientRequestId,
      actor: { id: operator?.id, name: operator?.name || operator?.username },
    }))
    const after = await prisma.profileStockEntity.findUnique({ where: { id: params.id } })

    await writeAuditLog(req, {
      action: 'SPLIT',
      entityType: 'PROFILE_STOCK_ENTITY',
      entityId: before.id,
      entityLabel: before.entityNo,
      beforeData: before,
      afterData: { parent: after, children },
      note: `拆分 ${input.quantity} 根单根实体`,
    })
    return NextResponse.json({ data: children, message: `已拆分 ${children.length} 根单根实体` })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Split profile stock error:', error)
    return NextResponse.json({ error: '拆分型材实体失败' }, { status: 500 })
  }
}
