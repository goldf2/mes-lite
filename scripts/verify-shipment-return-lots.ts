import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-shipment-return-lots-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

const close = (actual: number, expected: number, label: string) => {
  assert.ok(Math.abs(actual - expected) <= 0.000001, `${label}: expected ${expected}, got ${actual}`)
}

async function main() {
  const [
    { prisma },
    { postInventoryReceipt },
    { createInventoryLotReceipt, getInventoryLotTrace },
    { createManagedShipment, createManagedReturn },
    { shipManagedShipment, processManagedReturn },
    { listReturnShipmentOptions },
    { decideQualityInspection },
    { findStockIntegrityIssues },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/inventory'),
    import('../modules/inventory'),
    import('../modules/sales/server/fulfillment-command-service'),
    import('../modules/sales/server/fulfillment-status-service'),
    import('../modules/sales/server/fulfillment-query-service'),
    import('../modules/quality/server/quality-inspection-service'),
    import('../modules/inventory/server/stock-integrity-service'),
  ])

  try {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [location, returnLocation, customer, material] = await Promise.all([
      prisma.inventoryLocation.create({ data: { code: `SHIP-${suffix}`, name: '成品发货库位', isDefault: true } }),
      prisma.inventoryLocation.create({ data: { code: `RETURN-${suffix}`, name: '客户退货待检库位' } }),
      prisma.customer.create({ data: { code: `CUS-${suffix}`, name: '批次追溯客户' } }),
      prisma.material.create({ data: { code: `FIN-${suffix}`, name: '批次追溯成品', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件' } }),
    ])
    const product = await prisma.product.create({
      data: { sku: material.code, materialId: material.id, name: material.name, category: 'FINISHED', unit: '件' },
    })
    await prisma.$transaction(async (tx) => {
      const receipt = await postInventoryReceipt(tx, {
        materialId: material.id, stockQty: 20, valuationQty: 20, costAmount: 200,
        type: 'VERIFY_IN', refType: 'VERIFY', refId: suffix, note: '发货退货批次闭环期初',
        idempotencyKey: `VERIFY:SHIPMENT_RETURN:${suffix}`, locationId: location.id,
      })
      const lot = await createInventoryLotReceipt(tx, {
        lotNo: `FINLOT-${suffix}`, materialId: material.id, sourceType: 'VERIFY', sourceId: suffix,
        locationId: location.id, inventoryStatus: 'AVAILABLE', stockQty: 20, valuationQty: 20, costAmount: 200,
        stockLogId: receipt.movement!.id, idempotencyKey: `VERIFY:SHIPMENT_RETURN:${suffix}:LOT`,
      })
      await tx.stockLog.update({ where: { id: receipt.movement!.id }, data: { lotId: lot.id, inventoryStatus: 'AVAILABLE' } })
      if (receipt.costLayer) await tx.inventoryCostLayer.update({ where: { id: receipt.costLayer.id }, data: { lotId: lot.id, inventoryStatus: 'AVAILABLE' } })
    })

    const shipment = await createManagedShipment({
      materialId: material.id, customerId: customer.id, locationId: location.id, qty: 12,
    }, new Date('2026-08-13T12:00:00.000Z'))
    await shipManagedShipment(shipment.id, '发货验证员')
    const shipped = await prisma.shipment.findUniqueOrThrow({
      where: { id: shipment.id }, include: { lotAllocations: { include: { lot: { include: { balances: true } } } } },
    })
    assert.equal(shipped.lotTraceStatus, 'TRACKED')
    assert.equal(shipped.lotAllocations.length, 1)
    close(Number(shipped.lotAllocations[0].stockQty), 12, '真实批次发货数量')
    close(Number(shipped.lotAllocations[0].lot.balances[0].stockQty), 8, '发货后来源批次余额')
    const shipmentTrace = await getInventoryLotTrace(shipped.lotAllocations[0].lotId)
    assert.equal(shipmentTrace.customerShipments[0]?.shipmentNo, shipment.shipmentNo)
    assert.equal(shipmentTrace.customerShipments[0]?.customer, customer.name)

    const optionsBeforeReturn = await listReturnShipmentOptions()
    close(optionsBeforeReturn.find((item) => item.id === shipment.id)?.returnableQty || 0, 12, '退货前可退数量')
    const returnOrder = await createManagedReturn({
      shipmentId: shipment.id, productId: product.id, locationId: returnLocation.id,
      qty: 5, reason: '客户抽检退回', note: '验证退货独立待检批次',
    }, new Date('2026-08-13T13:00:00.000Z'))
    await processManagedReturn(returnOrder.id, '退货收货员')

    const [processed, stockAfterReturn, allocationAfterReturn] = await Promise.all([
      prisma.returnOrder.findUniqueOrThrow({
        where: { id: returnOrder.id },
        include: { inventoryLot: { include: { balances: true, inspections: true } }, lotAllocations: true },
      }),
      prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } }),
      prisma.shipmentLotAllocation.findFirstOrThrow({ where: { shipmentId: shipment.id } }),
    ])
    assert.ok(processed.inventoryLot, '处理退货必须生成独立批次')
    assert.equal(processed.inventoryLot.sourceType, 'RETURN_ORDER')
    assert.equal(processed.inventoryLot.returnOrderId, returnOrder.id)
    assert.equal(processed.inventoryLot.balances[0]?.inventoryStatus, 'QUARANTINE')
    assert.equal(processed.inventoryLot.inspections[0]?.status, 'PENDING')
    close(Number(processed.inventoryLot.balances[0]?.stockQty), 5, '退货待检批次数量')
    close(processed.lotAllocations.reduce((sum, item) => sum + Number(item.stockQty), 0), 5, '退货来源分配合计')
    close(Number(allocationAfterReturn.returnedStockQty), 5, '原发货批次累计退回数量')
    close(Number(stockAfterReturn.availableQty), 8, '退货收货后可用库存不得增加')
    close(Number(stockAfterReturn.quarantineQty), 5, '退货收货后待检库存')

    const returnTrace = await getInventoryLotTrace(processed.inventoryLot.id)
    assert.equal(returnTrace.returnSources[0]?.shipmentNo, shipment.shipmentNo)
    assert.equal(returnTrace.returnSources[0]?.lot.id, shipped.lotAllocations[0].lotId)
    const sourceTraceAfterReturn = await getInventoryLotTrace(shipped.lotAllocations[0].lotId)
    assert.equal(sourceTraceAfterReturn.returnDescendants[0]?.returnNo, returnOrder.returnNo)
    assert.equal(sourceTraceAfterReturn.returnDescendants[0]?.lot.id, processed.inventoryLot.id)

    await decideQualityInspection(processed.inventoryLot.inspections[0].id, {
      decision: 'PASS', sampleQty: 2, goodQty: 2, badQty: 0, note: '退货复检合格',
    }, '质量验证员')
    const releasedStock = await prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } })
    close(Number(releasedStock.availableQty), 13, '退货质检放行后可用库存')
    close(Number(releasedStock.quarantineQty), 0, '退货质检放行后待检库存')
    close((await listReturnShipmentOptions()).find((item) => item.id === shipment.id)?.returnableQty || 0, 7, '退货登记后剩余可退数量')

    const historicalShipment = await prisma.shipment.create({
      data: {
        shipmentNo: `SH-LEGACY-${suffix}`, productId: product.id, materialId: material.id, locationId: location.id,
        customerId: customer.id, qty: 2, customer: customer.name, status: 'DELIVERED', shippedAt: new Date('2026-07-01T00:00:00.000Z'),
        shippedValuationQty: 2, shippedCostAmount: 20,
      },
    })
    const historicalReturn = await createManagedReturn({
      shipmentId: historicalShipment.id, productId: product.id, locationId: returnLocation.id,
      qty: 1, reason: '迁移前历史发货退回',
    }, new Date('2026-08-13T14:00:00.000Z'))
    await processManagedReturn(historicalReturn.id, '历史退货收货员')
    const compatibleShipment = await prisma.shipment.findUniqueOrThrow({
      where: { id: historicalShipment.id }, include: { lotAllocations: { include: { lot: true } } },
    })
    assert.equal(compatibleShipment.lotTraceStatus, 'LEGACY')
    assert.equal(compatibleShipment.lotAllocations[0]?.lot.sourceType, 'LEGACY_SHIPMENT')
    assert.equal(compatibleShipment.lotAllocations[0]?.lot.supplierLotNo, null, '历史兼容批次不得伪造供应商批号')

    const integrityTypes = new Set((await findStockIntegrityIssues()).map((item) => item.type))
    assert.equal(integrityTypes.has('INVALID_SHIPMENT_LOT_ALLOCATION'), false)
    assert.equal(integrityTypes.has('INVALID_RETURN_LOT_ALLOCATION'), false)
    console.log('发货退货批次闭环验证通过：真实发货分配、客户去向、退货回流、待检隔离、质量放行与历史兼容均符合预期。')
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
