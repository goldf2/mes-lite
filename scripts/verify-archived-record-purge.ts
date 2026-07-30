import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma'
import { ArchivedRecordPurgeError, purgeArchivedRecord } from '../lib/archived-record-purge'

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase()
  const purgeCode = `VERIFY-PURGE-${suffix}`
  const blockedCode = `VERIFY-BLOCKED-${suffix}`
  let blockedMaterialId = ''
  let blockedStockId = ''

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

    console.log('归档永久删除验证通过：无引用物料释放编码及零库存行，有库存流水的物料被安全阻止。')
  } finally {
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
