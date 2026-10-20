import { NextRequest, NextResponse } from 'next/server'
import { taskHttp } from '@/modules/task-collaboration/http/task-http'
import { previewReleaseSchema } from '@/modules/task-collaboration/contracts/task-schema'
import { previewTaskRelease } from '@/modules/task-collaboration/server/task-release-service'
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // audit-exempt: 只读预览检查资料与版本，不产生业务写入或文件副本
  return taskHttp(req, 'read', true, async ({ actor, scope, audit }) => NextResponse.json({ data: await previewTaskRelease(params.id, previewReleaseSchema.parse(await req.json()), actor, scope) }, { status: 200 }))
}
