import { NextRequest, NextResponse } from 'next/server'
import { taskHttp } from '@/modules/task-collaboration/http/task-http'
import { revisionSchema } from '@/modules/task-collaboration/contracts/task-schema'
import { archiveOrRestoreTask } from '@/modules/task-collaboration/server/task-command-service'
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // audit-covered-by: taskHttp
  return taskHttp(req, 'update', false, async ({ actor, scope, audit }) => NextResponse.json({ data: await archiveOrRestoreTask(params.id, revisionSchema.parse(await req.json()).expectedRevision, true, actor, scope, audit) }))
}
