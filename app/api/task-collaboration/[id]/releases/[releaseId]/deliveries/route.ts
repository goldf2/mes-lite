import { NextRequest, NextResponse } from 'next/server'
import { taskHttp } from '@/modules/task-collaboration/http/task-http'
import { deliverySchema } from '@/modules/task-collaboration/contracts/task-schema'
import { recordTaskDelivery } from '@/modules/task-collaboration/server/task-release-service'
export async function POST(req: NextRequest, { params }: { params: { id: string; releaseId: string } }) {
  // audit-covered-by: taskHttp
  return taskHttp(req, 'read', true, async ({ actor, scope, audit }) => NextResponse.json({ data: await recordTaskDelivery(params.id, params.releaseId, deliverySchema.parse(await req.json()), actor, scope, audit) }, { status: 201 }))
}
