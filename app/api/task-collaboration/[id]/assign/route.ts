import { NextRequest, NextResponse } from 'next/server'
import { taskHttp } from '@/modules/task-collaboration/http/task-http'
import { assignTaskSchema } from '@/modules/task-collaboration/contracts/task-schema'
import { assignTask } from '@/modules/task-collaboration/server/task-command-service'
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // audit-covered-by: taskHttp
  return taskHttp(req, 'update', false, async ({ actor, scope, audit }) => NextResponse.json({ data: await assignTask(params.id, assignTaskSchema.parse(await req.json()), actor, scope, audit) }, { status: 200 }))
}
