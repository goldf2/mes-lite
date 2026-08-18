import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { attachmentUploadRoot, resolveAttachmentStoragePath } from '@/lib/attachment-storage'
import { prisma } from '@/lib/prisma'
import { getSystemSettings } from '@/lib/system-settings'
import type { BusinessDocumentKind, BusinessDocumentPdfResult } from '../contracts/business-document'
import {
  businessDocumentDefinition,
  GENERATED_BUSINESS_DOCUMENT_PDF_TYPE,
} from '../domain/business-document-definition'
import { BusinessDocumentError } from '../domain/business-document-errors'
import { businessDocumentPrintProfile, renderBusinessDocumentPdf } from './business-document-pdf'
import { loadBusinessDocumentPrintData } from './business-document-print-query-service'

function latestArchivedPdf(kind: BusinessDocumentKind, id: string) {
  const definition = businessDocumentDefinition(kind)!
  return prisma.documentAttachment.findFirst({
    where: {
      ownerType: definition.ownerType,
      ownerId: id,
      documentType: GENERATED_BUSINESS_DOCUMENT_PDF_TYPE,
      deletedAt: null,
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function hasArchivedBusinessDocumentPdf(kind: BusinessDocumentKind, id: string) {
  return Boolean(await latestArchivedPdf(kind, id))
}

export async function resolveBusinessDocumentPdf(
  kind: BusinessDocumentKind,
  id: string,
  regenerate = false,
): Promise<BusinessDocumentPdfResult> {
  const definition = businessDocumentDefinition(kind)
  if (!definition) throw new BusinessDocumentError('不支持的单据类型', 404)

  const [archivedPdf, settings] = await Promise.all([
    latestArchivedPdf(kind, id),
    getSystemSettings(),
  ])
  const printProfile = businessDocumentPrintProfile(settings)
  if (archivedPdf && !regenerate && archivedPdf.note?.includes(printProfile)) {
    return {
      pdf: await readFile(resolveAttachmentStoragePath(archivedPdf.storagePath)),
      filename: archivedPdf.originalName,
    }
  }

  const data = await loadBusinessDocumentPrintData(kind, id)
  if (!data) throw new BusinessDocumentError('单据不存在或已归档', 404)

  const pdf = await renderBusinessDocumentPdf(data, settings)
  const originalName = `${data.title}-${data.documentNo}.pdf`
  const ownerDirectory = path.join(attachmentUploadRoot(), definition.ownerType, id)
  await mkdir(ownerDirectory, { recursive: true })
  const fileName = `${Date.now()}-${randomUUID()}.pdf`
  const storagePath = path.join(ownerDirectory, fileName)
  await writeFile(storagePath, pdf)
  await prisma.documentAttachment.create({
    data: {
      ownerType: definition.ownerType,
      ownerId: id,
      documentType: GENERATED_BUSINESS_DOCUMENT_PDF_TYPE,
      originalName,
      fileName,
      mimeType: 'application/pdf',
      size: pdf.byteLength,
      url: `/api/business-documents/${kind}/${id}/print`,
      storagePath,
      note: `${archivedPdf ? '按当前打印格式重新生成的归档版本' : '首次打印生成的归档版本'}；${printProfile}`,
    },
  })
  return { pdf, filename: originalName }
}
