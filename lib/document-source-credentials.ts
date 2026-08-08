export const documentSourceCredentialOwnerTypes = [
  'MATERIAL_IN',
  'PRODUCTION_ORDER',
  'DISPATCH',
  'SALES_ORDER',
  'SHIPMENT',
  'RETURN_ORDER',
] as const

export type DocumentSourceCredentialOwnerType = (typeof documentSourceCredentialOwnerTypes)[number]

const documentSourceCredentialOwnerTypeSet = new Set<string>(documentSourceCredentialOwnerTypes)

export function supportsDocumentSourceCredentialRecognition(ownerType: string, documentType = 'ORIGINAL') {
  return documentType === 'ORIGINAL' && documentSourceCredentialOwnerTypeSet.has(ownerType)
}
