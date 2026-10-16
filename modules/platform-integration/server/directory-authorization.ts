import { createHash, timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getEffectivePermissionMap } from '@/lib/permissions'
import { DirectoryError, readDirectoryConfiguration } from '../domain/business-directory'

export async function directoryDelegateStatus(operatorId: string) {
  const operator = await prisma.operator.findUnique({ where: { id: operatorId }, select: { id: true, role: true, status: true } })
  if (!operator || operator.status !== 'ACTIVE') return { active: false, canReadCustomers: false }
  const permissions = await getEffectivePermissionMap(operator, { initializeDefaults: false })
  return { active: true, canReadCustomers: operator.role === 'ADMIN' || permissions.customers?.canRead === true }
}

export async function authorizeDirectoryRequest(request: Request) {
  const config = readDirectoryConfiguration()
  if (!config.enabled || !config.configured || !config.source) throw new DirectoryError('DIRECTORY_UNAVAILABLE', 503)
  const match = /^Bearer ([^\s]{32,4096})$/.exec(request.headers.get('authorization') || '')
  const provided = match?.[1] || ''
  const digest = (value: string) => createHash('sha256').update(value).digest()
  if (!match || !timingSafeEqual(digest(provided), Buffer.from(config.keyHash, 'hex'))) throw new DirectoryError('INVALID_API_KEY', 401)
  if (config.expired) throw new DirectoryError('DELEGATE_EXPIRED', 403)
  const delegate = await directoryDelegateStatus(config.operatorId)
  if (!delegate.active || !delegate.canReadCustomers) throw new DirectoryError('DELEGATE_FORBIDDEN', 403)
  return config.source
}
