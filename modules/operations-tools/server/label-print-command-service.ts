import { prisma } from '@/lib/prisma'
import type { ParsedCreateLabelPrintJobInput } from '../contracts/scan-print'
import { labelPrintJobNumber } from '../domain/scanning'
import { getOrCreateWarehousePackageLabel } from '@/modules/inventory'
import { assertInventoryLocationDataScope, shipmentDataScopeWhere, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'

export async function labelPrintReferenceResource(input: ParsedCreateLabelPrintJobInput) {
  if (input.referenceType !== 'PACKAGE_DOCUMENT') return null
  const box = await prisma.packageDocument.findUnique({ where: { id: input.referenceId || '' }, select: { sourceType: true } })
  return box?.sourceType === 'WAREHOUSE' ? 'stocks' as const : 'shipment' as const
}

export async function createLabelPrintJob(input: ParsedCreateLabelPrintJobInput, requestedBy: string | null, scope: EffectiveDataScope = unrestrictedDataScope) {
  let labelRevisionId: string | null = null
  let payload = input.payload
  if (input.referenceType === 'PACKAGE_DOCUMENT') {
    const box = await prisma.packageDocument.findUnique({ where: { id: input.referenceId || '' }, include: { shipment: { select: { items: { select: { locationId: true } } } } } })
    if (!box) throw new Error('货箱单据不存在')
    if (box.sourceType === 'WAREHOUSE') {
      const revision = await getOrCreateWarehousePackageLabel(box.id, requestedBy || '系统', scope)
      labelRevisionId = revision.id
      payload = revision.payload
    } else {
      const authorized = await prisma.shipment.findFirst({ where: { id: box.shipmentId || '', deletedAt: null, ...shipmentDataScopeWhere(scope) }, select: { id: true } })
      if (!authorized || !box.shipment || box.deletedAt) throw new Error('货箱单据不存在或无权访问')
      assertInventoryLocationDataScope(scope, box.shipment.items.map((item) => item.locationId))
    }
  }
  const existing = await prisma.labelPrintJob.findUnique({ where: { clientRequestId: input.clientRequestId } })
  if (existing) {
    if (existing.referenceType !== input.referenceType || existing.referenceId !== (input.referenceId || 'TEST')) throw new Error('该打印请求编号已用于其他单据')
    return existing
  }
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
      payloadJson: payload ? JSON.stringify(payload) : null,
      labelRevisionId,
      requestedBy,
    },
    update: {},
  })
}
