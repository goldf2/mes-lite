import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-shipment-negative-stock-'))
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
    { postInventoryIssue, postInventoryReceipt },
    { createInventoryLotReceipt },
    { findStockIntegrityIssues },
    { createManagedShipment, createManagedReturn },
    { reverseManagedShipment, shipManagedShipment },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/inventory'),
    import('../modules/inventory'),
    import('../modules/inventory/server/stock-integrity-service'),
    import('../modules/sales/server/fulfillment-command-service'),
    import('../modules/sales/server/fulfillment-status-service'),
  ])

  try {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [customer, location, material] = await Promise.all([
      prisma.customer.create({ data: { code: `NEG-CUS-${suffix}`, name: '负库存发货验证客户' } }),
      prisma.inventoryLocation.create({ data: { code: `NEG-LOC-${suffix}`, name: '负库存发货验证库位', isDefault: true } }),
      prisma.material.create({
        data: {
          code: `NEG-MAT-${suffix}`, name: '负库存发货验证物料', category: 'FINISHED', unit: '件',
          stockUnit: '件', valuationUnit: '件', conversionRate: 1, costingMethod: 'WEIGHTED_AVERAGE', defaultSalePrice: 20,
        },
      }),
    ])

    const shipment = await createManagedShipment({
      customerId: customer.id,
      items: [{ materialId: material.id, locationId: location.id, qty: 5 }],
    }, new Date('2026-09-04T04:00:00.000Z'))
    await shipManagedShipment(shipment.id, '负库存验证员')
    const [stockAfterShip, locationAfterShip, shortageAfterShip, shipmentAfterShip] = await Promise.all([
      prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } }),
      prisma.stockLocationBalance.findFirstOrThrow({ where: { stock: { materialId: material.id }, locationId: location.id } }),
      prisma.shipmentStockShortage.findUniqueOrThrow({ where: { shipmentItemId: shipment.items[0].id } }),
      prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
    ])
    close(stockAfterShip.qty, -5, '发货后总库存')
    close(stockAfterShip.availableQty, -5, '发货后可用库存')
    close(locationAfterShip.availableQty, -5, '发货后库位可用库存')
    close(shortageAfterShip.stockQty, 5, '发货欠库数量')
    assert.equal(shortageAfterShip.status, 'OPEN')
    assert.equal(shipmentAfterShip.lotTraceStatus, 'SHORTAGE')
    assert.equal(await prisma.shipmentLotAllocation.count({ where: { shipmentId: shipment.id } }), 0)
    await assert.rejects(() => prisma.$transaction((tx) => postInventoryIssue(tx, {
      materialId: material.id, stockQty: 1, type: 'VERIFY_OUT', refType: 'VERIFY', refId: suffix,
      note: '非发货流程仍禁止负库存', locationId: location.id,
    })), /库存不足/)
    assert.equal((await findStockIntegrityIssues()).some((item) => item.type === 'INVALID_STOCK_BALANCE'), false, '有效发货欠库不应被误报为库存损坏')
    const unrelatedLocation = await prisma.inventoryLocation.create({
      data: { code: `NEG-OTHER-${suffix}`, name: '负库存错误关联验证库位' },
    })
    await prisma.shipmentStockShortage.update({
      where: { id: shortageAfterShip.id },
      data: { locationId: unrelatedLocation.id },
    })
    assert.equal(
      (await findStockIntegrityIssues()).some((item) => item.type === 'INVALID_SHIPMENT_STOCK_SHORTAGE'),
      true,
      '物料、库位或发货明细不一致的欠库不能掩盖异常负库存',
    )
    await prisma.shipmentStockShortage.update({
      where: { id: shortageAfterShip.id },
      data: { locationId: location.id },
    })

    await prisma.$transaction(async (tx) => {
      const receipt = await postInventoryReceipt(tx, {
        materialId: material.id, stockQty: 3, valuationQty: 3, costAmount: 30,
        type: 'VERIFY_IN', refType: 'VERIFY_RECEIPT', refId: `${suffix}-1`, note: '第一次后补入库',
        idempotencyKey: `VERIFY:NEGATIVE_STOCK:${suffix}:RECEIPT:1`, locationId: location.id,
      })
      await createInventoryLotReceipt(tx, {
        lotNo: `NEG-LOT-1-${suffix}`, materialId: material.id, sourceType: 'VERIFY_RECEIPT', sourceId: `${suffix}-1`,
        locationId: location.id, inventoryStatus: 'AVAILABLE', stockQty: 3, valuationQty: 3, costAmount: 30,
        stockLogId: receipt.movement!.id, costLayerId: receipt.costLayer?.id,
        idempotencyKey: `VERIFY:NEGATIVE_STOCK:${suffix}:LOT:1`, createdBy: '收货验证员',
      })
    })
    const [stockAfterFirstReceipt, firstLotBalance, shortageAfterFirstReceipt] = await Promise.all([
      prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } }),
      prisma.inventoryLotBalance.findFirstOrThrow({ where: { lot: { lotNo: `NEG-LOT-1-${suffix}` }, inventoryStatus: 'AVAILABLE' } }),
      prisma.shipmentStockShortage.findUniqueOrThrow({ where: { shipmentItemId: shipment.items[0].id } }),
    ])
    close(stockAfterFirstReceipt.qty, -2, '第一次补库后的库存')
    close(stockAfterFirstReceipt.totalCost, 0, '第一次补库后的剩余库存成本')
    close(firstLotBalance.stockQty, 0, '第一次补库批次已用于历史欠库')
    close(shortageAfterFirstReceipt.settledStockQty, 3, '第一次补库数量')
    assert.equal(shortageAfterFirstReceipt.status, 'OPEN')
    await assert.rejects(() => createManagedReturn({
      shipmentId: shipment.id, shipmentItemId: shipment.items[0].id, locationId: location.id, qty: 1, reason: '欠库未补齐',
    }), /仍有待补库存/)

    await prisma.$transaction(async (tx) => {
      const receipt = await postInventoryReceipt(tx, {
        materialId: material.id, stockQty: 4, valuationQty: 4, costAmount: 40,
        type: 'VERIFY_IN', refType: 'VERIFY_RECEIPT', refId: `${suffix}-2`, note: '第二次后补入库',
        idempotencyKey: `VERIFY:NEGATIVE_STOCK:${suffix}:RECEIPT:2`, locationId: location.id,
      })
      await createInventoryLotReceipt(tx, {
        lotNo: `NEG-LOT-2-${suffix}`, materialId: material.id, sourceType: 'VERIFY_RECEIPT', sourceId: `${suffix}-2`,
        locationId: location.id, inventoryStatus: 'AVAILABLE', stockQty: 4, valuationQty: 4, costAmount: 40,
        stockLogId: receipt.movement!.id, costLayerId: receipt.costLayer?.id,
        idempotencyKey: `VERIFY:NEGATIVE_STOCK:${suffix}:LOT:2`, createdBy: '收货验证员',
      })
    })
    const [stockAfterSecondReceipt, secondLotBalance, shortageAfterSecondReceipt, shipmentAfterSettlement, allocations] = await Promise.all([
      prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } }),
      prisma.inventoryLotBalance.findFirstOrThrow({ where: { lot: { lotNo: `NEG-LOT-2-${suffix}` }, inventoryStatus: 'AVAILABLE' } }),
      prisma.shipmentStockShortage.findUniqueOrThrow({ where: { shipmentItemId: shipment.items[0].id } }),
      prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      prisma.shipmentLotAllocation.findMany({ where: { shipmentId: shipment.id, status: 'ACTIVE' } }),
    ])
    close(stockAfterSecondReceipt.qty, 2, '第二次补库后的库存')
    close(stockAfterSecondReceipt.valuationQty, 2, '第二次补库后的核算库存')
    close(stockAfterSecondReceipt.totalCost, 20, '第二次补库后的剩余库存成本')
    close(secondLotBalance.stockQty, 2, '第二次补库后的批次余额')
    close(shortageAfterSecondReceipt.settledStockQty, 5, '累计补库数量')
    assert.equal(shortageAfterSecondReceipt.status, 'SETTLED')
    assert.equal(shipmentAfterSettlement.lotTraceStatus, 'TRACKED')
    close(shipmentAfterSettlement.shippedCostAmount, 50, '补齐后的发货成本')
    close(allocations.reduce((sum, item) => sum + Number(item.stockQty), 0), 5, '补齐后的发货批次合计')

    await reverseManagedShipment(shipment.id, '仓库主管', '负库存发货测试冲销')
    const [stockAfterReverse, shortageAfterReverse, reversedAllocations, layers] = await Promise.all([
      prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } }),
      prisma.shipmentStockShortage.findUniqueOrThrow({ where: { shipmentItemId: shipment.items[0].id } }),
      prisma.shipmentLotAllocation.findMany({ where: { shipmentId: shipment.id } }),
      prisma.inventoryCostLayer.findMany({ where: { materialId: material.id } }),
    ])
    close(stockAfterReverse.qty, 7, '冲销后库存')
    close(stockAfterReverse.totalCost, 70, '冲销后成本')
    close(layers.reduce((sum, item) => sum + Number(item.remainingStockQty), 0), 7, '冲销后成本层数量')
    assert.equal(shortageAfterReverse.status, 'REVERSED')
    assert.ok(reversedAllocations.every((item) => item.status === 'REVERSED'))

    console.log('发货负库存验证通过：可先发货形成受控欠库，后续同库位可用入库自动补批次与成本，非发货出库仍受限且整单可冲销。')
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
