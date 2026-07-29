import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { getCurrentOperator } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { normalizeScanCode } from '@/lib/scanning'

const createSchema = z.object({
  clientRequestId: z.string().min(1).max(100),
  name: z.string().trim().max(100).optional(),
  expectedCode: z.string().min(1),
  expectedQty: z.number().finite().positive(),
  purpose: z.string().trim().max(50).default('GENERAL_COUNT'),
  referenceType: z.string().trim().max(50).default('GENERAL'),
  referenceId: z.string().trim().max(100).optional(),
  scannerModel: z.string().optional(),
})

function sessionNo() {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  return `SC-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('scanPrint', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const referenceId = searchParams.get('referenceId')
    const purpose = searchParams.get('purpose')
    const sessions = await prisma.scanCountSession.findMany({
      where: {
        ...(referenceId ? { referenceId } : {}),
        ...(purpose ? { purpose } : {}),
      },
      include: { events: { orderBy: { createdAt: 'desc' }, take: 30 } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return NextResponse.json({ data: sessions })
  } catch (error) {
    console.error('Get scan sessions error:', error)
    return NextResponse.json({ error: '获取扫码会话失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('scanPrint', 'create')
    if (denied) return denied

    const data = createSchema.parse(await req.json())
    const existing = await prisma.scanCountSession.findUnique({
      where: { clientRequestId: data.clientRequestId },
      include: { events: { orderBy: { createdAt: 'desc' }, take: 30 } },
    })
    if (existing) return NextResponse.json({ data: existing })

    const operator = await getCurrentOperator()
    const expectedCode = normalizeScanCode(data.expectedCode)
    const session = await prisma.scanCountSession.upsert({
      where: { clientRequestId: data.clientRequestId },
      create: {
        sessionNo: sessionNo(),
        clientRequestId: data.clientRequestId,
        name: data.name || null,
        purpose: data.purpose,
        referenceType: data.referenceType,
        referenceId: data.referenceId || expectedCode,
        expectedCode,
        expectedQty: data.expectedQty,
        scannerModel: data.scannerModel?.trim() || 'Honeywell Xenon 1900',
        createdBy: operator?.name,
      },
      update: {},
      include: { events: true },
    })

    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'SCAN_COUNT_SESSION',
      entityId: session.id,
      entityLabel: session.name || session.sessionNo,
      afterData: session,
    })
    return NextResponse.json({ data: session }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Create scan session error:', error)
    return NextResponse.json({ error: '创建扫码会话失败' }, { status: 500 })
  }
}
