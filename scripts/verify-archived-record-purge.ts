import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma'
import { ArchivedRecordPurgeError, purgeArchivedRecord } from '../lib/archived-record-purge'

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase()
  const purgeCode = `VERIFY-PURGE-${suffix}`
  const blockedCode = `VERIFY-BLOCKED-${suffix}`
  let blockedMaterialId = ''
  let blockedStockId = ''
  let supplierId = ''
  let reversedMaterialId = ''
  let reversedStockId = ''
  let reversedMaterialInId = ''
  let directMaterialId = ''
  let directStockId = ''
  let directMaterialInId = ''
  let documentMaterialId = ''
  let workInstructionId = ''

  try {
    const purgeMaterial = await prisma.material.create({
      data: {
        code: purgeCode,
        name: '永久删除验证物料',
        category: 'RAW',
        unit: '件',
        stockUnit: '件',
        valuationUnit: '件',
        deletedAt: new Date(),
        stock: { create: {} },
      },
      include: { stock: true },
    })

    const purged = await purgeArchivedRecord('material', purgeMaterial.id)
    assert.equal(purged.entityLabel, purgeCode)
    assert.equal(await prisma.material.count({ where: { id: purgeMaterial.id } }), 0)
    assert.equal(await prisma.stock.count({ where: { id: purgeMaterial.stock!.id } }), 0)

    const blockedMaterial = await prisma.material.create({
      data: {
        code: blockedCode,
        name: '引用保护验证物料',
        category: 'RAW',
        unit: '件',
        stockUnit: '件',
        valuationUnit: '件',
        deletedAt: new Date(),
        stock: { create: {} },
      },
      include: { stock: true },
    })
    blockedMaterialId = blockedMaterial.id
    blockedStockId = blockedMaterial.stock!.id
    await prisma.stockLog.create({
      data: {
        stockId: blockedStockId,
        type: 'VERIFY',
        qty: 0,
        beforeQty: 0,
        afterQty: 0,
        note: '验证归档引用保护',
      },
    })

    await assert.rejects(
      () => purgeArchivedRecord('material', blockedMaterialId),
      (error: unknown) => {
        assert.ok(error instanceof ArchivedRecordPurgeError)
        assert.equal(error.status, 409)
        assert.ok(error.blockers.some((blocker) => blocker.includes('库存流水')))
        return true
      },
    )
    assert.equal(await prisma.material.count({ where: { id: blockedMaterialId } }), 1)

    const supplier = await prisma.supplier.create({
      data: {
        code: `VERIFY-SUPPLIER-${suffix}`,
        name: '永久删除验证供应商',
      },
    })
    supplierId = supplier.id

    const reversedMaterial = await prisma.material.create({
      data: {
        code: `VERIFY-REVERSED-MATERIAL-${suffix}`,
        name: '完整红冲物料级联删除验证',
        category: 'RAW',
        unit: '件',
        stockUnit: '件',
        valuationUnit: '件',
        deletedAt: new Date(),
        stock: { create: {} },
      },
      include: { stock: true },
    })
    reversedMaterialId = reversedMaterial.id
    reversedStockId = reversedMaterial.stock!.id
    const reversedMaterialIn = await prisma.materialIn.create({
      data: {
        inboundNo: `VERIFY-REVERSED-IN-${suffix}`,
        supplierId: supplier.id,
        materialId: reversedMaterial.id,
        qty: 2,
        unit: '件',
        valuationQty: 2,
        valuationUnit: '件',
        totalAmount: 20,
        status: 'REVERSED',
      },
    })
    reversedMaterialInId = reversedMaterialIn.id
    await prisma.inventoryCostLayer.create({
      data: {
        materialId: reversedMaterial.id,
        materialInId: reversedMaterialIn.id,
        sourceType: 'MATERIAL_IN',
        sourceId: reversedMaterialIn.id,
        stockQty: 2,
        remainingStockQty: 0,
        valuationQty: 2,
        remainingValuationQty: 0,
        stockUnit: '件',
        valuationUnit: '件',
        valuationUnitCost: 10,
        stockUnitCost: 10,
        totalAmount: 20,
        remainingAmount: 0,
        status: 'REVERSED',
      },
    })
    await prisma.stockLog.createMany({
      data: [
        {
          stockId: reversedMaterial.stock!.id,
          type: 'IN',
          qty: 2,
          beforeQty: 0,
          afterQty: 2,
          valuationQty: 2,
          costAmount: 20,
          refType: 'MATERIAL_IN',
          refId: reversedMaterialIn.id,
        },
        {
          stockId: reversedMaterial.stock!.id,
          type: 'REVERSE_IN',
          qty: -2,
          beforeQty: 2,
          afterQty: 0,
          valuationQty: -2,
          costAmount: -20,
          refType: 'MATERIAL_IN_REVERSE',
          refId: reversedMaterialIn.id,
        },
      ],
    })
    await prisma.documentAttachment.createMany({
      data: [
        {
          ownerType: 'MATERIAL',
          ownerId: reversedMaterial.id,
          documentType: 'MATERIAL_IMAGE',
          originalName: 'material.jpg',
          fileName: 'material.jpg',
          mimeType: 'image/jpeg',
          size: 1,
          url: '/material.jpg',
          storagePath: '/tmp/material.jpg',
        },
        {
          ownerType: 'MATERIAL_IN',
          ownerId: reversedMaterialIn.id,
          originalName: 'voucher.pdf',
          fileName: 'voucher.pdf',
          mimeType: 'application/pdf',
          size: 1,
          url: '/voucher.pdf',
          storagePath: '/tmp/voucher.pdf',
        },
      ],
    })

    await purgeArchivedRecord('material', reversedMaterial.id)
    reversedMaterialId = ''
    reversedStockId = ''
    reversedMaterialInId = ''
    assert.equal(await prisma.material.count({ where: { id: reversedMaterial.id } }), 0)
    assert.equal(await prisma.materialIn.count({ where: { id: reversedMaterialIn.id } }), 0)
    assert.equal(await prisma.stock.count({ where: { id: reversedMaterial.stock!.id } }), 0)
    assert.equal(await prisma.stockLog.count({ where: { stockId: reversedMaterial.stock!.id } }), 0)
    assert.equal(await prisma.inventoryCostLayer.count({ where: { materialId: reversedMaterial.id } }), 0)
    assert.equal(await prisma.documentAttachment.count({
      where: {
        OR: [
          { ownerType: 'MATERIAL', ownerId: reversedMaterial.id },
          { ownerType: 'MATERIAL_IN', ownerId: reversedMaterialIn.id },
        ],
      },
    }), 0)

    const directMaterial = await prisma.material.create({
      data: {
        code: `VERIFY-REVERSED-DOCUMENT-${suffix}`,
        name: '红冲来料单永久删除验证',
        category: 'RAW',
        unit: '件',
        stockUnit: '件',
        valuationUnit: '件',
        stock: { create: {} },
      },
      include: { stock: true },
    })
    directMaterialId = directMaterial.id
    directStockId = directMaterial.stock!.id
    const directMaterialIn = await prisma.materialIn.create({
      data: {
        inboundNo: `VERIFY-DIRECT-IN-${suffix}`,
        supplierId: supplier.id,
        materialId: directMaterial.id,
        qty: 1,
        unit: '件',
        valuationQty: 1,
        valuationUnit: '件',
        totalAmount: 5,
        status: 'REVERSED',
        deletedAt: new Date(),
      },
    })
    directMaterialInId = directMaterialIn.id
    await prisma.inventoryCostLayer.create({
      data: {
        materialId: directMaterial.id,
        materialInId: directMaterialIn.id,
        sourceType: 'MATERIAL_IN',
        sourceId: directMaterialIn.id,
        stockQty: 1,
        remainingStockQty: 0,
        valuationQty: 1,
        remainingValuationQty: 0,
        stockUnit: '件',
        valuationUnit: '件',
        valuationUnitCost: 5,
        stockUnitCost: 5,
        totalAmount: 5,
        remainingAmount: 0,
        status: 'REVERSED',
      },
    })
    await prisma.stockLog.createMany({
      data: [
        {
          stockId: directStockId,
          type: 'IN',
          qty: 1,
          beforeQty: 0,
          afterQty: 1,
          valuationQty: 1,
          costAmount: 5,
          refType: 'MATERIAL_IN',
          refId: directMaterialIn.id,
        },
        {
          stockId: directStockId,
          type: 'REVERSE_IN',
          qty: -1,
          beforeQty: 1,
          afterQty: 0,
          valuationQty: -1,
          costAmount: -5,
          refType: 'MATERIAL_IN_REVERSE',
          refId: directMaterialIn.id,
        },
      ],
    })

    await purgeArchivedRecord('materialIn', directMaterialIn.id)
    directMaterialInId = ''
    assert.equal(await prisma.materialIn.count({ where: { id: directMaterialIn.id } }), 0)
    assert.equal(await prisma.stockLog.count({ where: { refId: directMaterialIn.id } }), 0)
    assert.equal(await prisma.inventoryCostLayer.count({
      where: { OR: [{ materialInId: directMaterialIn.id }, { sourceId: directMaterialIn.id }] },
    }), 0)
    assert.equal(await prisma.material.count({ where: { id: directMaterial.id } }), 1)

    const documentMaterial = await prisma.material.create({
      data: {
        code: `VERIFY-DOCUMENT-${suffix}`,
        name: '产品文档级联删除验证',
        category: 'FINISHED',
        unit: '件',
        stockUnit: '件',
        valuationUnit: '件',
      },
    })
    documentMaterialId = documentMaterial.id
    const documentCategory = await prisma.documentCategory.findFirst({ orderBy: { sortOrder: 'asc' } })
    assert.ok(documentCategory, '缺少产品文档类别')
    const workInstruction = await prisma.workInstruction.create({
      data: {
        materialId: documentMaterial.id,
        categoryId: documentCategory.id,
        deletedAt: new Date(),
      },
    })
    workInstructionId = workInstruction.id
    await prisma.documentAttachment.create({
      data: {
        ownerType: 'WORK_INSTRUCTION',
        ownerId: workInstruction.id,
        documentType: 'WORK_INSTRUCTION',
        originalName: 'verify.pdf',
        fileName: 'verify.pdf',
        mimeType: 'application/pdf',
        size: 1,
        url: '/verify.pdf',
        storagePath: '/tmp/verify.pdf',
      },
    })

    const purgedDocument = await purgeArchivedRecord('workInstruction', workInstruction.id)
    assert.equal(purgedDocument.entityLabel, `${documentMaterial.code} · ${documentMaterial.name}`)
    assert.equal(await prisma.workInstruction.count({ where: { id: workInstruction.id } }), 0)
    assert.equal(await prisma.documentAttachment.count({
      where: { ownerType: 'WORK_INSTRUCTION', ownerId: workInstruction.id },
    }), 0)
    workInstructionId = ''

    console.log('归档永久删除验证通过：完整红冲的来料历史可安全级联清理，其他业务引用继续受保护。')
  } finally {
    if (workInstructionId) {
      await prisma.documentAttachment.deleteMany({
        where: { ownerType: 'WORK_INSTRUCTION', ownerId: workInstructionId },
      }).catch(() => undefined)
      await prisma.workInstruction.deleteMany({ where: { id: workInstructionId } }).catch(() => undefined)
    }
    if (documentMaterialId) {
      await prisma.material.deleteMany({ where: { id: documentMaterialId } }).catch(() => undefined)
    }
    if (blockedStockId) {
      await prisma.stockLog.deleteMany({ where: { stockId: blockedStockId } }).catch(() => undefined)
      await prisma.stock.deleteMany({ where: { id: blockedStockId } }).catch(() => undefined)
    }
    if (blockedMaterialId) {
      await prisma.material.deleteMany({ where: { id: blockedMaterialId } }).catch(() => undefined)
    }
    if (reversedMaterialId || reversedMaterialInId) {
      await prisma.documentAttachment.deleteMany({
        where: {
          OR: [
            ...(reversedMaterialId ? [{ ownerType: 'MATERIAL', ownerId: reversedMaterialId }] : []),
            ...(reversedMaterialInId ? [{ ownerType: 'MATERIAL_IN', ownerId: reversedMaterialInId }] : []),
          ],
        },
      }).catch(() => undefined)
    }
    if (reversedMaterialId) {
      await prisma.inventoryCostLayer.deleteMany({ where: { materialId: reversedMaterialId } }).catch(() => undefined)
    }
    if (reversedStockId) {
      await prisma.stockLog.deleteMany({ where: { stockId: reversedStockId } }).catch(() => undefined)
    }
    if (reversedMaterialInId) {
      await prisma.materialIn.deleteMany({ where: { id: reversedMaterialInId } }).catch(() => undefined)
    }
    if (reversedStockId) {
      await prisma.stock.deleteMany({ where: { id: reversedStockId } }).catch(() => undefined)
    }
    if (reversedMaterialId) {
      await prisma.material.deleteMany({ where: { id: reversedMaterialId } }).catch(() => undefined)
    }
    if (directMaterialInId) {
      await prisma.inventoryCostLayer.deleteMany({
        where: { OR: [{ materialInId: directMaterialInId }, { sourceId: directMaterialInId }] },
      }).catch(() => undefined)
      await prisma.stockLog.deleteMany({ where: { refId: directMaterialInId } }).catch(() => undefined)
      await prisma.materialIn.deleteMany({ where: { id: directMaterialInId } }).catch(() => undefined)
    }
    if (directStockId) {
      await prisma.stockLog.deleteMany({ where: { stockId: directStockId } }).catch(() => undefined)
      await prisma.stock.deleteMany({ where: { id: directStockId } }).catch(() => undefined)
    }
    if (directMaterialId) {
      await prisma.material.deleteMany({ where: { id: directMaterialId } }).catch(() => undefined)
    }
    if (supplierId) {
      await prisma.supplier.deleteMany({ where: { id: supplierId } }).catch(() => undefined)
    }
    await prisma.$disconnect()
  }
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
