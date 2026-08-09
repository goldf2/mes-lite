import type { BusinessDocumentKind } from '../contracts/business-document'

export const GENERATED_BUSINESS_DOCUMENT_PDF_TYPE = 'SYSTEM_GENERATED_PDF'

const definitions = {
  'material-in': { permissionResource: 'materialIn', ownerType: 'MATERIAL_IN' },
  'sales-order': { permissionResource: 'salesOrder', ownerType: 'SALES_ORDER' },
  shipment: { permissionResource: 'shipment', ownerType: 'SHIPMENT' },
  return: { permissionResource: 'return', ownerType: 'RETURN_ORDER' },
  'flow-transfer': { permissionResource: 'stats', ownerType: 'FLOW_TRANSFER' },
  'production-order': { permissionResource: 'orders', ownerType: 'PRODUCTION_ORDER' },
  dispatch: { permissionResource: 'dispatch', ownerType: 'DISPATCH' },
} as const satisfies Record<BusinessDocumentKind, { permissionResource: string; ownerType: string }>

export function businessDocumentDefinition(kind: string) {
  return definitions[kind as BusinessDocumentKind] || null
}
