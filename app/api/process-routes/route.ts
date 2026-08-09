import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { processRouteInputSchema } from '@/modules/production/contracts/production-engineering-schema'
import {
  createProcessRoute,
  listProcessRoutes,
  ProductionEngineeringNotFoundError,
  updateProcessRoute,
} from '@/modules/production/server/production-engineering-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await requireResourcePermission('system', 'read')
  if (denied) return denied
  try {
    return NextResponse.json({ data: await listProcessRoutes() })
  } catch (error) {
    console.error('Get process routes error:', error)
    return NextResponse.json({ error: '获取工艺路线失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireResourcePermission('system', 'create')
  if (denied) return denied
  try {
    const { product, route } = await createProcessRoute(processRouteInputSchema.parse(await req.json()))
    await writeAuditLog(req, { action: 'CREATE', entityType: 'PROCESS_ROUTE', entityId: route.id, entityLabel: `${product.sku} ${route.name}`, afterData: route })
    return NextResponse.json({ data: route }, { status: 201 })
  } catch (error) {
    return processRouteError(error, 'create')
  }
}

export async function PUT(req: NextRequest) {
  const denied = await requireResourcePermission('system', 'update')
  if (denied) return denied
  try {
    const body = await req.json()
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) return NextResponse.json({ error: '参数错误', details: [{ message: '缺少工艺路线 ID' }] }, { status: 400 })
    const { before, product, route } = await updateProcessRoute(id, processRouteInputSchema.parse(body))
    await writeAuditLog(req, { action: 'UPDATE', entityType: 'PROCESS_ROUTE', entityId: route.id, entityLabel: `${product.sku} ${route.name}`, beforeData: before, afterData: route })
    return NextResponse.json({ data: route, message: '工艺路线已更新' })
  } catch (error) {
    return processRouteError(error, 'update')
  }
}

function processRouteError(error: unknown, operation: 'create' | 'update') {
  if (error instanceof ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
  if (error instanceof ProductionEngineeringNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 })
  console.error(`${operation === 'create' ? 'Create' : 'Update'} process route error:`, error)
  return NextResponse.json({ error: operation === 'create' ? '创建工艺路线失败' : '更新工艺路线失败，请确认该工艺尚未产生派工或报工记录' }, { status: 500 })
}
