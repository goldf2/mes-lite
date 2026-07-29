import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { classifyScan } from '@/lib/scanning'

const scanSchema = z.object({
  clientEventId: z.string().min(1).max(100),
  rawValue: z.string().min(1),
  quantity: z.number().finite().positive().max(100000).default(1),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const denied = await requireResourcePermission('scanPrint', 'update')
    if (denied) return denied

    const data = scanSchema.parse(await req.json())
    const result = await prisma.$transaction(async (tx) => {
      const existingEvent = await tx.scanCountEvent.findUnique({ where: { clientEventId: data.clientEventId } })
      if (existingEvent) {
        if (existingEvent.sessionId !== params.id) {
          return { error: '扫码请求标识已被其他会话使用', status: 409 } as const
        }
        const existingSession = await tx.scanCountSession.findUnique({
          where: { id: existingEvent.sessionId },
          include: { events: { orderBy: { createdAt: 'desc' }, take: 30 } },
        })
        return { data: existingSession, scanResult: existingEvent.result } as const
      }

      const session = await tx.scanCountSession.findUnique({ where: { id: params.id } })
      if (!session) return { error: '扫码会话不存在', status: 404 } as const
      if (session.status !== 'OPEN') return { error: '扫码会话已结束', status: 409 } as const

      const classification = classifyScan({
        rawValue: data.rawValue,
        expectedCode: session.expectedCode,
        countedQty: session.countedQty,
        expectedQty: session.expectedQty,
        quantity: data.quantity,
      })
      const { code, result: eventResult } = classification
      await tx.scanCountEvent.create({
        data: {
          sessionId: session.id,
          clientEventId: data.clientEventId,
          rawValue: data.rawValue,
          code,
          quantity: data.quantity,
          result: eventResult,
        },
      })
      const updated = eventResult === 'MATCHED'
        ? await tx.scanCountSession.update({
            where: { id: session.id },
            data: { countedQty: { increment: data.quantity } },
            include: { events: { orderBy: { createdAt: 'desc' }, take: 30 } },
          })
        : await tx.scanCountSession.findUnique({
            where: { id: session.id },
            include: { events: { orderBy: { createdAt: 'desc' }, take: 30 } },
          })
      return { data: updated, scanResult: eventResult } as const
    })

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '扫码参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Append scan event error:', error)
    return NextResponse.json({ error: '记录扫码失败' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const denied = await requireResourcePermission('scanPrint', 'update')
    if (denied) return denied

    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.scanCountSession.findUnique({ where: { id: params.id } })
      if (!session) return { error: '扫码会话不存在', status: 404 } as const
      if (session.status !== 'OPEN') return { error: '扫码会话已结束', status: 409 } as const
      const event = await tx.scanCountEvent.findFirst({
        where: { sessionId: session.id, result: 'MATCHED' },
        orderBy: { createdAt: 'desc' },
      })
      if (!event) return { error: '没有可撤销的有效扫码', status: 409 } as const

      await tx.scanCountEvent.delete({ where: { id: event.id } })
      const updated = await tx.scanCountSession.update({
        where: { id: session.id },
        data: { countedQty: Math.max(0, session.countedQty - event.quantity) },
        include: { events: { orderBy: { createdAt: 'desc' }, take: 30 } },
      })
      return { data: updated } as const
    })

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('Undo scan event error:', error)
    return NextResponse.json({ error: '撤销扫码失败' }, { status: 500 })
  }
}
