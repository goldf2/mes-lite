import type { DirectoryQuery, DirectorySource } from '../contracts/business-directory'
import { z } from 'zod'

export class DirectoryError extends Error {
  constructor(public code: string, public status: number) { super(code) }
}

export const directoryConfigurationKeys = [
  'BUSINESS_DIRECTORY_API_KEY_SHA256', 'BUSINESS_DIRECTORY_OPERATOR_ID',
  'BUSINESS_DIRECTORY_INSTANCE_ID', 'BUSINESS_DIRECTORY_TENANT_ID', 'BUSINESS_DIRECTORY_WORKSPACE_ID',
  'BUSINESS_DIRECTORY_EXPIRES_AT',
] as const

const sourceLabel = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
export function readDirectoryConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const keyHash = env.BUSINESS_DIRECTORY_API_KEY_SHA256 || ''
  const operatorId = env.BUSINESS_DIRECTORY_OPERATOR_ID?.trim() || ''
  const labels = [env.BUSINESS_DIRECTORY_INSTANCE_ID, env.BUSINESS_DIRECTORY_TENANT_ID, env.BUSINESS_DIRECTORY_WORKSPACE_ID]
    .map((value) => value?.trim() || '')
  const expiry = z.string().datetime({ offset: true }).safeParse(env.BUSINESS_DIRECTORY_EXPIRES_AT)
  const expiresAt = expiry.success && Number.isFinite(Date.parse(expiry.data)) ? expiry.data : null
  const validity = [/^[0-9a-fA-F]{64}$/.test(keyHash), sourceLabel.test(operatorId), ...labels.map((value) => sourceLabel.test(value)), expiresAt !== null]
  const missingConfiguration = directoryConfigurationKeys.filter((_, index) => !validity[index])
  const source: DirectorySource | null = labels.every((value) => sourceLabel.test(value))
    ? { appId: 'mes-lite', instanceId: labels[0], tenantId: labels[1], workspaceId: labels[2] }
    : null
  return {
    enabled: env.BUSINESS_DIRECTORY_ENABLED === 'true',
    configured: missingConfiguration.length === 0,
    keyHash, operatorId, source, missingConfiguration,
    expiresAt, expired: expiresAt !== null && Date.parse(expiresAt) <= Date.now(),
    credentialConfigured: validity[0],
    operatorConfigured: validity[1],
  }
}

export function parseDirectoryQuery(params: URLSearchParams): DirectoryQuery {
  const allowed = new Set(['q', 'enterpriseId', 'limit', 'offset'])
  for (const key of Array.from(params.keys())) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) throw new DirectoryError('INVALID_QUERY', 400)
  }
  const q = params.get('q') || ''
  const enterpriseId = params.get('enterpriseId')
  if (q.length > 200 || /[\u0000-\u001f\u007f]/.test(q)
    || (enterpriseId !== null && (!enterpriseId || enterpriseId.length > 200 || /\s/.test(enterpriseId)))) {
    throw new DirectoryError('INVALID_QUERY', 400)
  }
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const raw = params.get(key)
    if (raw === null) return fallback
    if (!/^(0|[1-9][0-9]*)$/.test(raw)) throw new DirectoryError('INVALID_QUERY', 400)
    const value = Number(raw)
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new DirectoryError('INVALID_QUERY', 400)
    return value
  }
  return { q: q.trim(), enterpriseId, limit: integer('limit', 50, 1, 100), offset: integer('offset', 0, 0, 100000) }
}
