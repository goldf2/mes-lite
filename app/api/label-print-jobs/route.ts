import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { getCurrentOperator } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'

const printSchema = z.object({
  clientRequestId: z.string().min(1).max(100),
  templateType: z.string().trim().max(50).default('GENERIC_LABEL'),
  referenceType: z.string().trim().max(50).default('GENERAL'),
  referenceId: z.string().trim().max(100).optional(),
  copies: z.number().int().min(1).max(100).default(1),
  printerIp: z.string().trim().optional(),
  labelWidthMm: z.number().finite().min(10).max(500).default(105),
  labelHeightMm: z.number().finite().min(10).max(500).default(70),
  payload: z.record(z.unknown()).optional(),
})

function jobNo() {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  return `LP-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('scanPrint', 'create')
    if (denied) return denied

    const data = printSchema.parse(await req.json())
    const existing = await prisma.labelPrintJob.findUnique({ where: { clientRequestId: data.clientRequestId } })
    if (existing) return NextResponse.json({ data: existing })

    const operator = await getCurrentOperator()
    const job = await prisma.labelPrintJob.upsert({
      where: { clientRequestId: data.clientRequestId },
      create: {
        jobNo: jobNo(),
        clientRequestId: data.clientRequestId,
        templateType: data.templateType,
        referenceType: data.referenceType,
        referenceId: data.referenceId || 'TEST',
        printerModel: 'Honeywell PC310T',
        printerDpi: 203,
        printerIp: data.printerIp || null,
        labelWidthMm: data.labelWidthMm,
        labelHeightMm: data.labelHeightMm,
        copies: data.copies,
        payloadJson: data.payload ? JSON.stringify(data.payload) : null,
        requestedBy: operator?.name,
      },
      update: {},
    })
    await writeAuditLog(req, {
      action: 'PRINT_REQUEST',
      entityType: 'LABEL_PRINT_JOB',
      entityId: job.id,
      entityLabel: `${job.templateType} ${job.jobNo}`,
      afterData: job,
    })
    return NextResponse.json({ data: job }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '打印参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Create label print job error:', error)
    return NextResponse.json({ error: '记录打印任务失败' }, { status: 500 })
  }
}
