import { prisma } from '@/lib/prisma'
import type { UpdateMaterialInInput } from '../contracts/material-in-schema'
import { MaterialInDomainError, runMaterialInDomainOperation } from '../domain/material-in-errors'
import { buildMaterialInLineData, materialInInclude } from './material-in-service'

export async function getMaterialInDetail(id: string) {
  const materialIn = await prisma.materialIn.findUnique({ where: { id }, include: materialInInclude() })
  if (!materialIn) throw new MaterialInDomainError('来料单不存在', 404)
  return materialIn
}

export async function updateManagedMaterialIn(id: string, input: UpdateMaterialInInput) {
  return runMaterialInDomainOperation(() => prisma.$transaction(async (tx) => {
    const current = await tx.materialIn.findUnique({ where: { id }, include: materialInInclude() })
    if (!current || current.deletedAt) throw new MaterialInDomainError('来料单不存在或已归档', 404)
    if (current.status !== 'PENDING') throw new MaterialInDomainError('只有待收货来料单可以修改')
    const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, deletedAt: null } })
    if (!supplier) throw new MaterialInDomainError('供应商不存在或已归档', 404)
    const { data } = await buildMaterialInLineData(tx, input, current.locationId)
    const updated = await tx.materialIn.update({
      where: { id },
      data: {
        supplierId: supplier.id,
        voucherNo: input.voucherNo?.trim() || null,
        ...data,
        receivedBy: input.receivedBy?.trim() || null,
        note: input.note?.trim() || null,
      },
      include: materialInInclude(),
    })
    return { current, updated }
  }))
}
