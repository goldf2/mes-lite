import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-shipment-multi-item-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

async function main() {
  const [{ prisma }, { postInventoryIssue, postInventoryReceipt }, { createManagedShipment, createManagedReturn }, { shipManagedShipment, processManagedReturn }] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/inventory'),
    import('../modules/sales/server/fulfillment-command-service'),
    import('../modules/sales/server/fulfillment-status-service'),
  ])
  try {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const fixedNow = new Date('2026-08-22T02:00:00.000Z')
    const [customer, locationA, locationB, materialA, materialB] = await Promise.all([
      prisma.customer.create({ data: { code: `MULTI-CUS-${suffix}`, name: '多明细验证客户' } }),
      prisma.inventoryLocation.create({ data: { code: `MULTI-A-${suffix}`, name: '多明细 A 库位', isDefault: true } }),
      prisma.inventoryLocation.create({ data: { code: `MULTI-B-${suffix}`, name: '多明细 B 库位' } }),
      prisma.material.create({ data: { code: `MULTI-MAT-A-${suffix}`, name: '多明细物料 A', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件', conversionRate: 1, defaultSalePrice: 10 } }),
      prisma.material.create({ data: { code: `MULTI-MAT-B-${suffix}`, name: '多明细物料 B', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件', conversionRate: 1, defaultSalePrice: 20 } }),
    ])
    await prisma.$transaction(async (tx) => {
      await postInventoryReceipt(tx, { materialId: materialA.id, stockQty: 50, valuationQty: 50, costAmount: 250, type: 'VERIFY_IN', refType: 'VERIFY', refId: suffix, note: 'A 期初', idempotencyKey: `VERIFY:MULTI:A:${suffix}`, locationId: locationA.id })
      await postInventoryReceipt(tx, { materialId: materialB.id, stockQty: 40, valuationQty: 40, costAmount: 320, type: 'VERIFY_IN', refType: 'VERIFY', refId: suffix, note: 'B 期初', idempotencyKey: `VERIFY:MULTI:B:${suffix}`, locationId: locationB.id })
    })

    const shipment = await createManagedShipment({
      customerId: customer.id,
      voucherNo: 'MULTI-VERIFY',
      items: [
        { materialId: materialA.id, locationId: locationA.id, qty: 4 },
        { materialId: materialB.id, locationId: locationB.id, qty: 2 },
      ],
    }, fixedNow)
    assert.equal(shipment.items.length, 2, '一张发货单必须支持多条物料明细')
    assert.deepEqual([shipment.qty, shipment.totalAmount], [6, 80], '单头兼容汇总必须正确')

    await shipManagedShipment(shipment.id, '多明细验证员')
    const [stockA, stockB, shippedItems, allocations] = await Promise.all([
      prisma.stock.findUniqueOrThrow({ where: { materialId: materialA.id } }),
      prisma.stock.findUniqueOrThrow({ where: { materialId: materialB.id } }),
      prisma.shipmentItem.findMany({ where: { shipmentId: shipment.id }, orderBy: { sortOrder: 'asc' } }),
      prisma.shipmentLotAllocation.findMany({ where: { shipmentId: shipment.id } }),
    ])
    assert.deepEqual([stockA.qty, stockA.totalCost, stockB.qty, stockB.totalCost], [46, 230, 38, 304])
    assert.deepEqual(shippedItems.map((item) => item.shippedCostAmount), [20, 16])
    assert.equal(allocations.length, 2)

    const returnOrder = await createManagedReturn({ shipmentId: shipment.id, shipmentItemId: shipment.items[1].id, locationId: locationB.id, qty: 2, reason: '多明细逐行退货验证' }, fixedNow)
    await processManagedReturn(returnOrder.id, '多明细退货员')
    assert.equal((await prisma.stock.findUniqueOrThrow({ where: { materialId: materialA.id } })).qty, 46, '退回 B 明细不得改变 A 库存')
    assert.equal((await prisma.stock.findUniqueOrThrow({ where: { materialId: materialB.id } })).qty, 40)

    const rollbackShipment = await createManagedShipment({ customerId: customer.id, items: [
      { materialId: materialA.id, locationId: locationA.id, qty: 3 },
      { materialId: materialB.id, locationId: locationB.id, qty: 30 },
    ] }, fixedNow)
    await prisma.$transaction((tx) => postInventoryIssue(tx, { materialId: materialB.id, stockQty: 15, type: 'VERIFY_OUT', refType: 'VERIFY', refId: suffix, note: '制造库存不足', idempotencyKey: `VERIFY:MULTI:DEPLETION:${suffix}`, locationId: locationB.id }))
    const stockABeforeRollback = await prisma.stock.findUniqueOrThrow({ where: { materialId: materialA.id } })
    await assert.rejects(() => shipManagedShipment(rollbackShipment.id, '回滚验证员'), /库存不足/)
    const [stockAAfterRollback, rollbackHeader, rollbackLogs] = await Promise.all([
      prisma.stock.findUniqueOrThrow({ where: { materialId: materialA.id } }),
      prisma.shipment.findUniqueOrThrow({ where: { id: rollbackShipment.id } }),
      prisma.stockLog.count({ where: { refType: 'SHIPMENT', refId: rollbackShipment.id } }),
    ])
    assert.deepEqual([stockAAfterRollback.qty, stockAAfterRollback.totalCost], [stockABeforeRollback.qty, stockABeforeRollback.totalCost])
    assert.deepEqual([rollbackHeader.status, rollbackLogs], ['PENDING', 0])

    console.log('多明细发货验证通过：同客户多物料、逐行库存/成本/批次/退货和整单事务回滚符合预期。')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
