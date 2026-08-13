import { prisma } from '@/lib/prisma'
import { assertInventoryLocationDataScope, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import { resolveInventoryLocation } from '@/lib/inventory'
import type { UpdateMaterialInInput } from '../contracts/material-in-schema'
import { MaterialInDomainError, runMaterialInDomainOperation } from '../domain/material-in-errors'
import {
  buildMaterialInLineData,
  materialReceiptInclude,
  toMaterialInRecord,
} from './material-in-service'

export async function getMaterialInDetail(id: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  const receipt = await prisma.materialReceipt.findUnique({ where: { id }, include: materialReceiptInclude() })
  if (!receipt || receipt.deletedAt) throw new MaterialInDomainError('来料单不存在', 404)
  assertInventoryLocationDataScope(scope, [receipt.stagingLocationId])
  return toMaterialInRecord(receipt)
}

export async function updateManagedMaterialIn(id: string, input: UpdateMaterialInInput, scope: EffectiveDataScope = unrestrictedDataScope) {
  return runMaterialInDomainOperation(() => prisma.$transaction(async (tx) => {
    const current = await tx.materialReceipt.findUnique({ where: { id }, include: materialReceiptInclude() })
    if (!current || current.deletedAt) throw new MaterialInDomainError('来料单不存在或已归档', 404)
    assertInventoryLocationDataScope(scope, [current.stagingLocationId, input.stagingLocationId || current.stagingLocationId])
    if (current.status !== 'PENDING') throw new MaterialInDomainError('只有待收货来料单可以修改')
    const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, deletedAt: null } })
    if (!supplier) throw new MaterialInDomainError('供应商不存在或已归档', 404)
    const stagingLocation = await resolveInventoryLocation(tx, input.stagingLocationId || current.stagingLocationId)
    const lineData = []
    for (const item of input.items) lineData.push(await buildMaterialInLineData(tx, item, stagingLocation.id, scope))

    await tx.materialIn.deleteMany({ where: { receiptId: id } })
    for (let index = 0; index < lineData.length; index += 1) {
      const lineNo = index + 1
      await tx.materialIn.create({
        data: {
          receiptId: id,
          lineNo,
          inboundNo: `${current.inboundNo}-${String(lineNo).padStart(3, '0')}`,
          voucherNo: input.voucherNo?.trim() || null,
          supplierId: supplier.id,
          ...lineData[index].data,
          receivedBy: input.receivedBy?.trim() || null,
          note: input.note?.trim() || null,
          status: 'PENDING',
        },
      })
    }
    await tx.materialReceipt.update({
      where: { id },
      data: {
        supplierId: supplier.id,
        stagingLocationId: stagingLocation.id,
        voucherNo: input.voucherNo?.trim() || null,
        receivedBy: input.receivedBy?.trim() || null,
        note: input.note?.trim() || null,
      },
    })
    const updated = await tx.materialReceipt.findUniqueOrThrow({ where: { id }, include: materialReceiptInclude() })
    return { current: toMaterialInRecord(current), updated: toMaterialInRecord(updated) }
  }))
}
