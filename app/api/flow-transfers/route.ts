import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import {
  flowTransferInclude,
  flowTransferInputSchema,
  parseFlowTransferDate,
  resolveFlowTransferDraft,
} from '@/lib/flow-transfer'

export const dynamic = 'force-dynamic'

async function nextTransferNo(tx: Prisma.TransactionClient, date: Date) {
  const dateCode = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('')
  const start = new Date(date)
  const end = new Date(date)
  end.setDate(end.getDate() + 1)
  const count = await tx.flowTransfer.count({ where: { transferDate: { gte: start, lt: end } } })
  return `FT-${dateCode}-${String(count + 1).padStart(3, '0')}`
}

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stats', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const keyword = searchParams.get('keyword')?.trim()
    const status = searchParams.get('status')?.trim()
    const where: Prisma.FlowTransferWhereInput = {}
    if (status && status !== 'ALL') where.status = status
    if (keyword) {
      where.OR = [
        { transferNo: { contains: keyword } },
        { operator: { contains: keyword } },
        { note: { contains: keyword } },
        { material: { is: { code: { contains: keyword } } } },
        { material: { is: { name: { contains: keyword } } } },
      ]
    }

    const [transfers, materials, locations] = await Promise.all([
      prisma.flowTransfer.findMany({
        where,
        include: flowTransferInclude,
        orderBy: [{ transferDate: 'desc' }, { createdAt: 'desc' }],
        take: 300,
      }),
      prisma.material.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          code: true,
          name: true,
          spec: true,
          category: true,
          stockUnit: true,
          unit: true,
          stock: {
            select: {
              qty: true,
              availableQty: true,
              locationBalances: {
                select: {
                  locationId: true,
                  qty: true,
                  reservedQty: true,
                  availableQty: true,
                },
              },
            },
          },
        },
        orderBy: [{ category: 'asc' }, { code: 'asc' }],
        take: 1000,
      }),
      prisma.inventoryLocation.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true, code: true, name: true, isDefault: true },
        orderBy: [{ isDefault: 'desc' }, { code: 'asc' }],
      }),
    ])

    const materialIds = materials.map((material) => material.id)
    const images = materialIds.length === 0 ? [] : await prisma.documentAttachment.findMany({
      where: {
        ownerType: 'MATERIAL',
        ownerId: { in: materialIds },
        documentType: 'MATERIAL_IMAGE',
        mimeType: { startsWith: 'image/' },
        deletedAt: null,
      },
      orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, ownerId: true, note: true, mimeType: true, isCover: true },
    })
    const primaryImageByMaterial = new Map<string, (typeof images)[number]>()
    for (const image of images) {
      if (!primaryImageByMaterial.has(image.ownerId)) primaryImageByMaterial.set(image.ownerId, image)
    }
    const materialOptions = materials.map((material) => {
      const image = primaryImageByMaterial.get(material.id)
      return {
        ...material,
        primaryImage: image ? {
          id: image.id,
          url: `/api/attachments/${image.id}/file`,
          note: image.note,
          mimeType: image.mimeType,
          isCover: image.isCover,
        } : null,
      }
    })

    return NextResponse.json({ data: transfers, materials: materialOptions, locations })
  } catch (error) {
    console.error('Get flow transfers error:', error)
    return NextResponse.json({ error: '获取流程转移记录失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stats', 'create')
    if (denied) return denied

    const input = flowTransferInputSchema.parse(await req.json())
    const transferDate = parseFlowTransferDate(input.transferDate)
    const transfer = await prisma.$transaction(async (tx) => {
      const { material } = await resolveFlowTransferDraft(tx, input)
      const transferNo = await nextTransferNo(tx, transferDate)
      return tx.flowTransfer.create({
        data: {
          transferNo,
          transferDate,
          materialId: material.id,
          sourceLocationId: input.sourceLocationId,
          targetLocationId: input.targetLocationId,
          quantity: input.quantity,
          unit: material.stockUnit || material.unit,
          operator: input.operator,
          note: input.note || null,
        },
        include: flowTransferInclude,
      })
    })
    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'FLOW_TRANSFER',
      entityId: transfer.id,
      entityLabel: transfer.transferNo,
      afterData: transfer,
      note: '创建流程转移草稿，尚未变动库存',
    })
    return NextResponse.json({ data: transfer, message: '流程转移草稿已创建' }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Create flow transfer error:', error)
    return NextResponse.json({ error: '创建流程转移失败' }, { status: 500 })
  }
}
