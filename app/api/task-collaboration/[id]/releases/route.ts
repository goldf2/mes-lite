import { NextRequest, NextResponse } from 'next/server'
import { taskHttp } from '@/modules/task-collaboration/http/task-http'
import { releaseTaskSchema } from '@/modules/task-collaboration/contracts/task-schema'
import { publishTaskRelease } from '@/modules/task-collaboration/server/task-release-service'
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // audit-covered-by: taskHttp
  return taskHttp(req, 'update', true, async ({ actor, scope, audit }) => NextResponse.json({ data: await publishTaskRelease(params.id, releaseTaskSchema.parse(await req.json()), actor, scope, audit) }, { status: 201 }))
}
