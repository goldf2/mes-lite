import type { PermissionAction, PermissionMap, PermissionResource } from '@/lib/permissions'
import type { ArchiveModel } from '../contracts/maintenance'

export const archiveResourceByModel: Record<ArchiveModel, PermissionResource> = {
  material: 'materials',
  supplier: 'suppliers',
  customer: 'customers',
  materialIn: 'materialIn',
  workInstruction: 'workInstructions',
  order: 'orders',
  dispatch: 'dispatch',
  shipment: 'shipment',
  return: 'return',
}

const permissionFlagByAction = {
  read: 'canRead',
  create: 'canCreate',
  update: 'canUpdate',
  delete: 'canDelete',
  grant: 'canGrant',
} as const

export function archiveModelsAllowedByPermissions(permissions: PermissionMap, action: PermissionAction) {
  const permissionFlag = permissionFlagByAction[action]
  return (Object.keys(archiveResourceByModel) as ArchiveModel[]).filter((model) => (
    Boolean(permissions[archiveResourceByModel[model]]?.[permissionFlag])
  ))
}

export function archiveModelActionsByPermissions(permissions: PermissionMap, models: readonly ArchiveModel[]) {
  return Object.fromEntries(models.map((model) => {
    const resourcePermissions = permissions[archiveResourceByModel[model]]
    return [model, {
      canRestore: Boolean(permissions.archive?.canUpdate && resourcePermissions?.canUpdate),
      canPurge: Boolean(permissions.archive?.canDelete && resourcePermissions?.canDelete),
    }]
  }))
}
