import { prisma } from '@/lib/prisma'
import type { ParsedCreateLabelPrintJobInput } from '../contracts/scan-print'
import { labelPrintJobNumber } from '../domain/scanning'

export async function createLabelPrintJob(input: ParsedCreateLabelPrintJobInput, requestedBy: string | null) {
  const existing = await prisma.labelPrintJob.findUnique({ where: { clientRequestId: input.clientRequestId } })
  if (existing) return existing
  return prisma.labelPrintJob.upsert({
    where: { clientRequestId: input.clientRequestId },
    create: {
      jobNo: labelPrintJobNumber(),
      clientRequestId: input.clientRequestId,
      templateType: input.templateType,
      referenceType: input.referenceType,
      referenceId: input.referenceId || 'TEST',
      printerModel: 'Honeywell PC310T',
      printerDpi: 203,
      printerIp: input.printerIp || null,
      labelWidthMm: input.labelWidthMm,
      labelHeightMm: input.labelHeightMm,
      copies: input.copies,
      payloadJson: input.payload ? JSON.stringify(input.payload) : null,
      requestedBy,
    },
    update: {},
  })
}
