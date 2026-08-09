import type { PartyKind } from '../contracts/reference-data'

export interface PartyKindDefinition {
  kind: PartyKind
  label: '供应商' | '客户'
  entityType: 'SUPPLIER' | 'CUSTOMER'
  orderEntity: 'suppliers' | 'customers'
  uniqueActiveName: boolean
}

const partyKindDefinitions: Record<PartyKind, PartyKindDefinition> = {
  supplier: {
    kind: 'supplier',
    label: '供应商',
    entityType: 'SUPPLIER',
    orderEntity: 'suppliers',
    uniqueActiveName: false,
  },
  customer: {
    kind: 'customer',
    label: '客户',
    entityType: 'CUSTOMER',
    orderEntity: 'customers',
    uniqueActiveName: true,
  },
}

export function getPartyKindDefinition(kind: PartyKind) {
  return partyKindDefinitions[kind]
}
