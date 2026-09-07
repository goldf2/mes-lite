/**
 * 业务单据领域的服务端公开出口，供其他服务端领域复用通用 PDF 能力。
 * 客户端只能使用 index.ts，避免把 PDF 引擎、文件系统或 Prisma 依赖打入浏览器。
 */
export { businessDocumentPrintProfile, renderBusinessDocumentPdf } from './server/business-document-pdf'
export type { BusinessDocumentPdfResult, BusinessDocumentPrintData } from './contracts/business-document'
