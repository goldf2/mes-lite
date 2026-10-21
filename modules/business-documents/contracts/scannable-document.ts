export type ScannableDocumentType = 'SHIPMENT' | 'PACKAGE_DOCUMENT'

export interface ScannableDocumentResult {
  type: ScannableDocumentType
  referenceId: string
  shipmentId: string | null
  documentNo: string
  title: string
  description: string
  status: string
  href: string
}
