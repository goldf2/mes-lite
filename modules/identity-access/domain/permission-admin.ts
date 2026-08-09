import type { PermissionFlags } from '@/lib/permissions'

export function isPermissionAdmin(role: string) {
  return role === 'ADMIN'
}

export function hasAnyGrant(permissions: Record<string, PermissionFlags>) {
  return Object.values(permissions).some((flags) => flags.canGrant)
}

export function normalizePermissionGroupCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
