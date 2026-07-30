import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma'
import { ArchivedRecordPurgeError, purgeArchivedRecord } from '../lib/archived-record-purge'

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase()
  const purgeCode = `VERIFY-PURGE-${suffix}`
  const blockedCode = `VERIFY-BLOCKED-${suffix}`
  let blockedMaterialId = ''
  let blockedStockId = ''
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
    const workInstruction = await prisma.workInstruction.create({
      data: {
        materialId: documentMaterial.id,
        category: 'DRAWING',
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

    console.log('归档永久删除验证通过：普通主数据继续执行引用保护，产品文档会级联删除自有附件记录。')
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
    await prisma.$disconnect()
  }
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
