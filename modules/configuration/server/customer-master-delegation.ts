import { createHmac } from 'node:crypto'

export interface CustomerMasterActor { issuer: string; subject: string }
/** Only call with a validated MES session principal; not request-provided identity. */
export function signCustomerMasterRequest(actor: CustomerMasterActor, target: string, instanceId: string, key: string, now = Math.floor(Date.now() / 1000)) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'MES-Contact-Delegation' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iss: 'mes-lite', aud: 'equipment-maintenance:customer-master:v1', actorIssuer: actor.issuer, sub: actor.subject, iat: now, exp: now + 60, method: 'GET', target, instanceId, tenantId: 'local', workspaceId: 'default' })).toString('base64url')
  const input = `${header}.${payload}`
  return `${input}.${createHmac('sha256', key).update(input).digest('base64url')}`
}
