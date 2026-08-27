import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-shipment-reversal-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

const close = (actual: number, expected: number, label: string) => {
  assert.ok(Math.abs(actual - expected) <= 0.000001, `${label}: expected ${expected}, got ${actual}`)
}

async function main() {
  const [
    { prisma },
    { postInventoryReceipt },
    { createInventoryLotReceipt },
    { createManagedShipment, createManagedReturn },
    { shipManagedShipment, deliverManagedShipment, reverseManagedShipment },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/inventory'),
    import('../modules/inventory'),
    import('../modules/sales/server/fulfillment-command-service'),
    import('../modules/sales/server/fulfillment-status-service'),
  ])

  try {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [customer, location, material] = await Promise.all([
      prisma.customer.create({ data: { code: `REV-CUS-${suffix}`, name: '发货冲销验证客户' } }),
      prisma.inventoryLocation.create({ data: { code: `REV-LOC-${suffix}`, name: '发货冲销验证库位', isDefault: true } }),
      prisma.material.create({
        data: {
          code: `REV-MAT-${suffix}`, name: '发货冲销 FIFO 物料', category: 'FINISHED', unit: '件',
          stockUnit: '件', valuationUnit: '件', conversionRate: 1, costingMethod: 'FIFO', defaultSalePrice: 20,
        },
      }),
    ])
    await prisma.$transaction(async (tx) => {
      const receipt = await postInventoryReceipt(tx, {
        materialId: material.id, stockQty: 10, valuationQty: 10, costAmount: 100,
        type: 'VERIFY_IN', refType: 'VERIFY', refId: suffix, note: '发货冲销期初',
        idempotencyKey: `VERIFY:SHIPMENT_REVERSE:${suffix}`, locationId: location.id,
      })
      const lot = await createInventoryLotReceipt(tx, {
        lotNo: `REV-LOT-${suffix}`, materialId: material.id, sourceType: 'VERIFY', sourceId: suffix,
        locationId: location.id, inventoryStatus: 'AVAILABLE', stockQty: 10, valuationQty: 10, costAmount: 100,
        stockLogId: receipt.movement!.id, idempotencyKey: `VERIFY:SHIPMENT_REVERSE:${suffix}:LOT`,
      })
      await tx.stockLog.update({ where: { id: receipt.movement!.id }, data: { lotId: lot.id, inventoryStatus: 'AVAILABLE' } })
      if (receipt.costLayer) await tx.inventoryCostLayer.update({ where: { id: receipt.costLayer.id }, data: { lotId: lot.id } })
    })

    const shipment = await createManagedShipment({
      customerId: customer.id, items: [{ materialId: material.id, locationId: location.id, qty: 4 }],
    }, new Date('2026-08-27T08:00:00.000Z'))
    await prisma.packageDocument.create({
      data: {
        packageNo: `PKG-REV-${suffix}`, shipmentId: shipment.id, packedBy: '包装验证员',
        items: { create: { shipmentItemId: shipment.items[0].id, materialId: material.id, quantity: 4, unitSnapshot: '件' } },
      },
    })
    await shipManagedShipment(shipment.id, '发货验证员')
    const [stockAfterShip, itemAfterShip, layerAfterShip, lotAfterShip] = await Promise.all([
      prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } }),
      prisma.shipmentItem.findUniqueOrThrow({ where: { id: shipment.items[0].id } }),
      prisma.inventoryCostLayer.findFirstOrThrow({ where: { materialId: material.id, sourceType: 'VERIFY' } }),
      prisma.inventoryLotBalance.findFirstOrThrow({ where: { lot: { materialId: material.id }, locationId: location.id } }),
    ])
    close(stockAfterShip.qty, 6, '发货后库存')
    close(stockAfterShip.totalCost, 60, '发货后成本')
    close(layerAfterShip.remainingStockQty, 6, '发货后 FIFO 成本层')
    close(lotAfterShip.stockQty, 6, '发货后批次余额')
    assert.ok(itemAfterShip.costLayerSnapshot, '新发货必须冻结 FIFO 成本层消耗快照')

    await reverseManagedShipment(shipment.id, '仓库主管', '错发客户，货物未离库')
    const [reversed, stockAfterReverse, layerAfterReverse, lotAfterReverse, sourceMovement, lotAllocation, packageDocument] = await Promise.all([
      prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } }),
      prisma.inventoryCostLayer.findFirstOrThrow({ where: { materialId: material.id, sourceType: 'VERIFY' } }),
      prisma.inventoryLotBalance.findFirstOrThrow({ where: { lot: { materialId: material.id }, locationId: location.id } }),
      prisma.stockLog.findUniqueOrThrow({ where: { idempotencyKey: `SHIPMENT:${shipment.id}:ITEM:${shipment.items[0].id}:SHIP` } }),
      prisma.shipmentLotAllocation.findFirstOrThrow({ where: { shipmentId: shipment.id } }),
      prisma.packageDocument.findFirstOrThrow({ where: { shipmentId: shipment.id } }),
    ])
    assert.equal(reversed.status, 'REVERSED')
    assert.equal(reversed.reversedBy, '仓库主管')
    assert.equal(reversed.reverseReason, '错发客户，货物未离库')
    close(stockAfterReverse.qty, 10, '冲销后库存')
    close(stockAfterReverse.totalCost, 100, '冲销后成本')
    close(layerAfterReverse.remainingStockQty, 10, '冲销后 FIFO 成本层')
    close(lotAfterReverse.stockQty, 10, '冲销后批次余额')
    assert.ok(sourceMovement.reversalMovementId, '原发货流水必须链接冲销流水')
    assert.equal(lotAllocation.status, 'REVERSED')
    assert.equal(packageDocument.status, 'REVERSED')
    await assert.rejects(() => reverseManagedShipment(shipment.id, '仓库主管', '重复冲销'), /只能冲销已发货/)

    const deliveredShipment = await createManagedShipment({
      customerId: customer.id, items: [{ materialId: material.id, locationId: location.id, qty: 1 }],
    }, new Date('2026-08-27T09:00:00.000Z'))
    await shipManagedShipment(deliveredShipment.id, '发货验证员')
    await deliverManagedShipment(deliveredShipment.id, '签收验证员')
    await assert.rejects(() => reverseManagedShipment(deliveredShipment.id, '仓库主管', '签收后误冲销'), /已经签收/)
    const delivered = await prisma.shipment.findUniqueOrThrow({ where: { id: deliveredShipment.id } })
    assert.equal(delivered.deliveredBy, '签收验证员')
    assert.ok(delivered.deliveredAt)

    const returnedShipment = await createManagedShipment({
      customerId: customer.id, items: [{ materialId: material.id, locationId: location.id, qty: 1 }],
    }, new Date('2026-08-27T10:00:00.000Z'))
    await shipManagedShipment(returnedShipment.id, '发货验证员')
    await createManagedReturn({
      shipmentId: returnedShipment.id, shipmentItemId: returnedShipment.items[0].id,
      locationId: location.id, qty: 1, reason: '待处理退货阻止整单冲销',
    }, new Date('2026-08-27T11:00:00.000Z'))
    await assert.rejects(() => reverseManagedShipment(returnedShipment.id, '仓库主管', '存在退货时误冲销'), /已有退货单/)

    console.log('发货冲销验证通过：总库存、库位、FIFO 成本层、批次、货箱和审计状态均可逆；签收及退货依赖会阻止错误冲销。')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  rmSync(verifyRoot, { recursive: true, force: true })
  process.exit(1)
})
