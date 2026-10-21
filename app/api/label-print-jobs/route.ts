import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { createLabelPrintJobSchema } from '@/modules/operations-tools/contracts/scan-print'
import { createLabelPrintJob, labelPrintReferenceResource } from '@/modules/operations-tools/server/label-print-command-service'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'
import { WarehousePackageError } from '@/modules/inventory'

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('scanPrint', 'create')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const input = createLabelPrintJobSchema.parse(await req.json())
    const referenceResource = await labelPrintReferenceResource(input)
    if (referenceResource) {
      const ownerDenied = await requireResourcePermission(referenceResource, 'read')
      if (ownerDenied) return ownerDenied
    }
    const job = await createLabelPrintJob(input, operator.name, await loadEffectiveDataScope(operator))
    await writeAuditLog(req, {
      action: 'PRINT_REQUEST', entityType: 'LABEL_PRINT_JOB', entityId: job.id,
      entityLabel: `${job.templateType} ${job.jobNo}`, afterData: job,
    })
    return NextResponse.json({ data: job }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '打印参数错误', details: error.errors }, { status: 400 })
    if (error instanceof DataScopeError || error instanceof WarehousePackageError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Create label print job error:', error)
    return NextResponse.json({ error: '记录打印任务失败' }, { status: 500 })
  }
}
