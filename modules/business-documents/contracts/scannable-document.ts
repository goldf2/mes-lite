export type ScannableDocumentType = 'SHIPMENT' | 'PACKAGE_DOCUMENT'

export interface ScannableDocumentResult {
  type: ScannableDocumentType
  referenceId: string
  shipmentId: string
  documentNo: string
  title: string
  description: string
  status: string
  href: string
}
