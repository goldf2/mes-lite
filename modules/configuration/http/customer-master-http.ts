import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentOperator } from '@/lib/auth'
import { getEffectivePermissionMap } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { customerMasterResources, linkCustomerMasterSchema, masterId, type CustomerMasterResource } from '../contracts/customer-master'
import { CustomerMasterError, fetchCustomerMaster } from '../server/customer-master-client'
import { linkCustomerMaster } from '../server/customer-master-service'
async function actorPermissions() {
  const actor = await getCurrentOperator()
  if (!actor) throw new CustomerMasterError('CUSTOMER_MASTER_FORBIDDEN', 403)
  const permissions = actor.role === 'ADMIN' ? { canRead: true, canCreate: true, canUpdate: true } : (await getEffectivePermissionMap(actor, { initializeDefaults: false })).customers
  if (!permissions?.canRead) throw new CustomerMasterError('CUSTOMER_MASTER_FORBIDDEN', 403)
  return permissions
}
export function customerMasterHttpError(error: unknown) {
  if (error instanceof CustomerMasterError) return NextResponse.json({ error: error.code }, { status: error.status, headers: { 'Cache-Control': 'no-store' } })
  if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'INVALID_CUSTOMER_MASTER_QUERY' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  return NextResponse.json({ error: 'CUSTOMER_MASTER_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
}
export async function customerMasterGet(request: Request, resource: string, id?: string) {
  try {
    await actorPermissions()
    if (!customerMasterResources.includes(resource as CustomerMasterResource)) throw new CustomerMasterError('INVALID_CUSTOMER_MASTER_RESOURCE', 400)
    if (id && !masterId.safeParse(id).success) throw new CustomerMasterError('INVALID_CUSTOMER_MASTER_ID', 400)
    const params = new URL(request.url).searchParams
    const seen = new Set<string>()
    for (const [key] of Array.from(params)) { if (id || !['q', 'enterpriseId', 'limit', 'offset'].includes(key) || seen.has(key)) throw new CustomerMasterError('INVALID_CUSTOMER_MASTER_QUERY', 400); seen.add(key) }
    if ((params.get('q') || '').trim().length > 200 || (params.has('enterpriseId') && !masterId.safeParse(params.get('enterpriseId')).success)) throw new CustomerMasterError('INVALID_CUSTOMER_MASTER_QUERY', 400)
    for (const [key, min, max] of [['limit', 1, 100], ['offset', 0, 100000]] as const) if (params.has(key) && (!/^\d+$/.test(params.get(key)!) || Number(params.get(key)) < min || Number(params.get(key)) > max)) throw new CustomerMasterError('INVALID_CUSTOMER_MASTER_QUERY', 400)
    if (params.has('q')) params.set('q', params.get('q')!.trim())
    return NextResponse.json(await fetchCustomerMaster(resource as CustomerMasterResource, params, id), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return customerMasterHttpError(error) }
}
export async function customerMasterLinkPost(request: Request) {
  try {
    const permissions = await actorPermissions()
    const input = linkCustomerMasterSchema.parse(await request.json())
    if (input.customerId ? !permissions.canUpdate : !permissions.canCreate) throw new CustomerMasterError('CUSTOMER_MASTER_FORBIDDEN', 403)
    const result = await linkCustomerMaster(input)
    if (result.linkCreated) await writeAuditLog(request, { action: 'LINK_CUSTOMER_MASTER', entityType: 'CUSTOMER', entityId: result.customerId, note: '关联到数据平台正式客户；原客户资料及历史单据保持', afterData: { enterpriseId: result.enterpriseId } })
    return NextResponse.json({ data: result }, { status: result.createdReference ? 201 : 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return customerMasterHttpError(error) }
}
