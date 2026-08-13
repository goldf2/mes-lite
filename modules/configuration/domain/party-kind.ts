import type { PartyKind } from '../contracts/reference-data'
import type { PermissionResource } from '@/lib/permissions'

export interface PartyKindDefinition {
  kind: PartyKind
  label: '供应商' | '客户'
  entityType: 'SUPPLIER' | 'CUSTOMER'
  orderEntity: 'suppliers' | 'customers'
  uniqueActiveName: boolean
  permissionResource: 'suppliers' | 'customers'
  referenceReadResources: PermissionResource[]
}

const partyKindDefinitions: Record<PartyKind, PartyKindDefinition> = {
  supplier: {
    kind: 'supplier',
    label: '供应商',
    entityType: 'SUPPLIER',
    orderEntity: 'suppliers',
    uniqueActiveName: false,
    permissionResource: 'suppliers',
    referenceReadResources: ['suppliers', 'materialIn'],
  },
  customer: {
    kind: 'customer',
    label: '客户',
    entityType: 'CUSTOMER',
    orderEntity: 'customers',
    uniqueActiveName: true,
    permissionResource: 'customers',
    referenceReadResources: ['customers', 'materials', 'workInstructions', 'dispatch', 'stocks', 'salesOrder', 'shipment', 'return', 'materialIn'],
  },
}

export function getPartyKindDefinition(kind: PartyKind) {
  return partyKindDefinitions[kind]
}
