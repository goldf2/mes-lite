import { NextRequest, NextResponse } from 'next/server'
import { taskHttp } from '@/modules/task-collaboration/http/task-http'
import { createTaskSchema } from '@/modules/task-collaboration/contracts/task-schema'
import { listTasks } from '@/modules/task-collaboration/server/task-query-service'
import { createTask } from '@/modules/task-collaboration/server/task-command-service'
export async function GET(req: NextRequest) {
  return taskHttp(req, 'read', false, async ({ scope }) => {
    const p = req.nextUrl.searchParams
    const result = await listTasks({ keyword: p.get('keyword') || undefined, status: p.get('status') || undefined,
      archived: p.get('archived') === '1', page: Number(p.get('page') || 1), pageSize: Number(p.get('pageSize') || 20) }, scope)
    return NextResponse.json({ data: result.items, pagination: result.pagination })
  })
}
export async function POST(req: NextRequest) {
  // audit-covered-by: taskHttp
  return taskHttp(req, 'create', false, async ({ actor, scope, audit }) => {
    const body = await req.json()
    const input = createTaskSchema.parse(body)
    const inherit = { lines: !Object.prototype.hasOwnProperty.call(body, 'lines'), documentRefs: !Object.prototype.hasOwnProperty.call(body, 'documentRefs'), instructions: !Object.prototype.hasOwnProperty.call(body, 'instructions') }
    return NextResponse.json({ data: await createTask(input, actor, scope, audit, inherit) }, { status: 201 })
  })
}
