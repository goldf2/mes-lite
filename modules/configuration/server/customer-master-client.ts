import { getCurrentCasdoorActor } from '@/lib/auth'
import { getEffectivePermissionMap } from '@/lib/permissions'
import { signCustomerMasterRequest, type CustomerMasterActor } from './customer-master-delegation'
import { customerMasterResources, masterEnvelopeSchema, masterId, masterRecordSchemas, type CustomerMasterResource, type MasterEnvelope } from '../contracts/customer-master'
export class CustomerMasterError extends Error { constructor(public code: string, public status = 503) { super(code) } }
export const customerMasterEnabled = () => process.env.CUSTOMER_MASTER_ENABLED === 'true'
function configuredOrigin(raw: string | undefined, env: NodeJS.ProcessEnv) {
  try {
    const url = new URL(raw || '')
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error()
    if (url.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error()
    return url.origin
  } catch { throw new CustomerMasterError('CUSTOMER_MASTER_UNAVAILABLE') }
}
export function customerMasterConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const key = env.CUSTOMER_MASTER_DELEGATION_SECRET || '', instanceId = env.CUSTOMER_MASTER_INSTANCE_ID || ''
  if (env.CUSTOMER_MASTER_ENABLED !== 'true' || !/^[^\s\u0000-\u001f\u007f]{32,4096}$/.test(key) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(instanceId)) throw new CustomerMasterError('CUSTOMER_MASTER_UNAVAILABLE')
  return { key, instanceId, origin: configuredOrigin(env.CUSTOMER_MASTER_BASE_URL, env), managementOrigin: configuredOrigin(env.CUSTOMER_MASTER_MANAGEMENT_URL || env.CUSTOMER_MASTER_BASE_URL, env) }
}
export function masterManagementHref(resource: CustomerMasterResource, id?: string) {
  const collection = { enterprises: 'customers', contacts: 'contacts', locations: 'sites' }[resource]
  return `${customerMasterConfiguration().managementOrigin}/workspaces/local/default/data/${collection}${id ? `/${encodeURIComponent(id)}` : ''}`
}
export function customerMasterMetadata() {
  if (!customerMasterEnabled()) return { enabled: false, managementHref: null }
  try { return { enabled: true, managementHref: masterManagementHref('enterprises') } }
  catch { return { enabled: true, managementHref: null } }
}
export async function requireCustomerMasterActor(): Promise<CustomerMasterActor> {
  const actor = await getCurrentCasdoorActor()
  if (!actor) throw new CustomerMasterError('CUSTOMER_MASTER_CASDOOR_LOGIN_REQUIRED', 403)
  if (actor.operator.role !== 'ADMIN' && !(await getEffectivePermissionMap(actor.operator, { initializeDefaults: false })).customers?.canRead) throw new CustomerMasterError('CUSTOMER_MASTER_FORBIDDEN', 403)
  return { issuer: actor.issuer, subject: actor.subject }
}
export async function fetchCustomerMaster(resource: CustomerMasterResource, params = new URLSearchParams(), id?: string): Promise<MasterEnvelope> {
  return requestCustomerMaster(await requireCustomerMasterActor(), resource, params, id)
}
/** Server transport. Public HTTP handlers always use fetchCustomerMaster, which checks the session. */
export async function requestCustomerMaster(actor: CustomerMasterActor, resource: CustomerMasterResource, params = new URLSearchParams(), id?: string, fetcher: typeof fetch = fetch): Promise<MasterEnvelope> {
  const config = customerMasterConfiguration()
  if (!customerMasterResources.includes(resource)) throw new CustomerMasterError('INVALID_CUSTOMER_MASTER_RESOURCE', 400)
  if (id && !masterId.safeParse(id).success) throw new CustomerMasterError('INVALID_CUSTOMER_MASTER_ID', 400)
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 5000)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const url = `${config.origin}/api/integrations/customer-master/v1/${resource}${id ? `/${encodeURIComponent(id)}` : params.size ? `?${params}` : ''}`
    const response = await fetcher(url, { method: 'GET', headers: { Authorization: `Bearer ${signCustomerMasterRequest(actor, new URL(url).pathname + new URL(url).search, config.instanceId, config.key)}`, Accept: 'application/json' }, redirect: 'manual', cache: 'no-store', signal: controller.signal })
    if (response.status === 401 || response.status === 403) throw new CustomerMasterError('CUSTOMER_MASTER_FORBIDDEN', 403)
    if (response.status !== 200 || !response.body) throw new CustomerMasterError(response.status === 404 ? 'CUSTOMER_MASTER_RECORD_NOT_FOUND' : 'CUSTOMER_MASTER_UNAVAILABLE', response.status === 404 ? 404 : 503)
    reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0
    for (;;) { const result = await reader.read(); if (result.done) break; size += result.value.byteLength; if (size > 1048576) throw new CustomerMasterError('CUSTOMER_MASTER_RESPONSE_TOO_LARGE'); chunks.push(result.value) }
    const envelope = masterEnvelopeSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    if (envelope.source.instanceId !== config.instanceId || envelope.resource !== resource) throw new CustomerMasterError('CUSTOMER_MASTER_SOURCE_MISMATCH')
    const records = envelope.records.map(raw => masterRecordSchemas[resource].parse(raw))
    for (const record of records) if (record.sourceRef.appId !== envelope.source.appId || record.sourceRef.instanceId !== config.instanceId || record.sourceRef.tenantId !== 'local' || record.sourceRef.workspaceId !== 'default' || record.sourceRef.resource !== resource || record.sourceRef.recordId !== record.id) throw new CustomerMasterError('CUSTOMER_MASTER_SOURCE_MISMATCH')
    if (id && (records.length !== 1 || records[0].id !== id || envelope.page.limit !== 1 || envelope.page.offset !== 0 || envelope.page.total !== 1 || envelope.page.hasMore)) throw new CustomerMasterError('CUSTOMER_MASTER_RECORD_MISMATCH')
    if (records.length > envelope.page.limit || envelope.page.total < records.length) throw new CustomerMasterError('CUSTOMER_MASTER_PAGE_MISMATCH')
    const enterpriseId = params.get('enterpriseId')
    if (enterpriseId && records.some(record => 'enterpriseId' in record ? record.enterpriseId !== enterpriseId : record.id !== enterpriseId)) throw new CustomerMasterError('CUSTOMER_MASTER_RELATION_MISMATCH')
    return { ...envelope, records, managementHref: masterManagementHref(resource) }
  } catch (error) { if (error instanceof CustomerMasterError) throw error; throw new CustomerMasterError('CUSTOMER_MASTER_UNAVAILABLE') }
  finally { clearTimeout(timer); controller.abort(); if (reader) await reader.cancel().catch(() => {}) }
}
