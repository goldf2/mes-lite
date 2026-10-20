import { NextRequest, NextResponse } from 'next/server'
import { taskHttp } from '@/modules/task-collaboration/http/task-http'
import { updateTaskSchema } from '@/modules/task-collaboration/contracts/task-schema'
import { getTask } from '@/modules/task-collaboration/server/task-query-service'
import { updateTask } from '@/modules/task-collaboration/server/task-command-service'
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return taskHttp(req, 'read', false, async ({ scope }) => NextResponse.json({ data: await getTask(params.id, scope) }))
}
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  // audit-covered-by: taskHttp
  return taskHttp(req, 'update', false, async ({ actor, scope, audit }) => NextResponse.json({ data: await updateTask(params.id, updateTaskSchema.parse(await req.json()), actor, scope, audit) }))
}
