import { NextRequest, NextResponse } from 'next/server'
import { taskHttp } from '@/modules/task-collaboration/http/task-http'
import { getTaskRelease } from '@/modules/task-collaboration/server/task-release-service'
export async function GET(req: NextRequest, { params }: { params: { id: string; releaseId: string } }) {
  return taskHttp(req, 'read', false, async ({ scope }) => {
    const release = await getTaskRelease(params.id, params.releaseId, scope)
    return new NextResponse(JSON.stringify(release.manifest, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="task-release-${release.id}.json"`, 'Cache-Control': 'private, no-store' } })
  })
}
