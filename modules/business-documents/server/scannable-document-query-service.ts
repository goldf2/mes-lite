import { prisma } from '@/lib/prisma'
import {
  assertInventoryLocationDataScope,
  shipmentDataScopeWhere,
  unrestrictedDataScope,
  type EffectiveDataScope,
} from '@/modules/identity-access'

function normalizeScannedCode(rawValue: string) {
  const value = rawValue.trim()
  if (!value) return ''
  try {
    const url = new URL(value)
    return url.searchParams.get('code')?.trim() || url.pathname.split('/').filter(Boolean).pop()?.trim() || value
  } catch {
    return value
  }
}

export async function resolveScannableDocument(rawValue: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  const code = normalizeScannedCode(rawValue)
  if (!code) return null

  const packageDocument = await prisma.packageDocument.findFirst({
    where: {
      packageNo: code,
      deletedAt: null,
      shipment: { is: { deletedAt: null, ...shipmentDataScopeWhere(scope) } },
    },
    include: {
      shipment: { include: { product: { select: { name: true } } } },
      items: { select: { quantity: true, unitSnapshot: true } },
    },
  })
  if (packageDocument) {
    assertInventoryLocationDataScope(scope, [packageDocument.shipment.locationId])
    const quantity = packageDocument.items.reduce((sum, item) => sum + Number(item.quantity), 0)
    const unit = packageDocument.items[0]?.unitSnapshot || ''
    return {
      type: 'PACKAGE_DOCUMENT' as const,
      referenceId: packageDocument.id,
      shipmentId: packageDocument.shipmentId,
      documentNo: packageDocument.packageNo,
      title: `货箱 ${packageDocument.packageNo}`,
      description: `${packageDocument.shipment.product.name} · ${quantity} ${unit} · 发货单 ${packageDocument.shipment.shipmentNo}`,
      status: packageDocument.status,
      href: `/?page=shipment&document=${encodeURIComponent(packageDocument.shipmentId)}&package=${encodeURIComponent(packageDocument.id)}`,
    }
  }

  const shipment = await prisma.shipment.findFirst({
    where: { shipmentNo: code, deletedAt: null, ...shipmentDataScopeWhere(scope) },
    include: { product: { select: { name: true, unit: true } } },
  })
  if (!shipment) return null
  assertInventoryLocationDataScope(scope, [shipment.locationId])
  return {
    type: 'SHIPMENT' as const,
    referenceId: shipment.id,
    shipmentId: shipment.id,
    documentNo: shipment.shipmentNo,
    title: `发货单 ${shipment.shipmentNo}`,
    description: `${shipment.customer} · ${shipment.product.name} · ${shipment.qty} ${shipment.product.unit}`,
    status: shipment.status,
    href: `/?page=shipment&document=${encodeURIComponent(shipment.id)}`,
  }
}
