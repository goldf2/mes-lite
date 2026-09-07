/**
 * 销售领域的服务端公开出口。
 * 页面继续使用 index.ts；跨领域服务只从这里读取受控的服务端能力，避免穿透 server 子目录。
 */
export { getShipmentDeliveryNoteSource } from './server/fulfillment-query-service'
export { SalesDomainError } from './domain/sales-errors'
export {
  createShipmentDeliveryNote,
  createShipmentInternalArchive,
  hasArchivedShipmentDocumentPdf,
  resolveShipmentDocumentPdf,
  shipmentDocumentAudiences,
  SHIPMENT_CUSTOMER_PDF_TYPE,
  SHIPMENT_INTERNAL_PDF_TYPE,
} from './server/shipment-document-service'
export type { ShipmentDocumentAudience } from './server/shipment-document-service'
