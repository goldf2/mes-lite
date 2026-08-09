import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { createLabelPrintJobSchema } from '@/modules/operations-tools/contracts/scan-print'
import { createLabelPrintJob } from '@/modules/operations-tools/server/label-print-command-service'

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('scanPrint', 'create')
    if (denied) return denied
    const operator = await getCurrentOperator()
    const job = await createLabelPrintJob(createLabelPrintJobSchema.parse(await req.json()), operator?.name || null)
    await writeAuditLog(req, {
      action: 'PRINT_REQUEST', entityType: 'LABEL_PRINT_JOB', entityId: job.id,
      entityLabel: `${job.templateType} ${job.jobNo}`, afterData: job,
    })
    return NextResponse.json({ data: job }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '打印参数错误', details: error.errors }, { status: 400 })
    console.error('Create label print job error:', error)
    return NextResponse.json({ error: '记录打印任务失败' }, { status: 500 })
  }
}
