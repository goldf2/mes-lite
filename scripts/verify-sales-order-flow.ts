import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-sales-order-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

async function main() {
  const [
    { prisma },
    { postInventoryReceipt },
    { createManagedSalesOrder, confirmManagedSalesOrder },
    { listSalesOrders, getShipmentCreateOptions },
    { listShipments },
    { createManagedShipment, createManagedReturn },
    { shipManagedShipment, deliverManagedShipment, processManagedReturn },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/inventory'),
    import('../modules/sales/server/sales-order-command-service'),
    import('../modules/sales/server/sales-order-query-service'),
    import('../modules/sales/server/fulfillment-query-service'),
    import('../modules/sales/server/fulfillment-command-service'),
    import('../modules/sales/server/fulfillment-status-service'),
  ])
  try {
    const fixedNow = new Date('2026-08-10T08:00:00.000Z')
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [customer, location, material] = await Promise.all([
      prisma.customer.create({ data: { code: `CUS-${suffix}`, name: '销售发货解耦验证客户' } }),
      prisma.inventoryLocation.create({ data: { code: `SALE-${suffix}`, name: '销售验证库位', isDefault: true } }),
      prisma.material.create({ data: {
        code: `SALE-${suffix}`, name: '销售发货解耦验证成品', category: 'FINISHED', unit: '件',
        stockUnit: '件', valuationUnit: '件', conversionRate: 1, defaultSalePrice: 12.5, salesCurrency: 'CNY',
      } }),
    ])
    await prisma.$transaction((tx) => postInventoryReceipt(tx, {
      materialId: material.id, stockQty: 120, valuationQty: 120, costAmount: 1200,
      type: 'VERIFY_IN', refType: 'VERIFY', refId: suffix, note: '验证期初库存',
      idempotencyKey: `VERIFY:SALES:${suffix}`, locationId: location.id,
    }))
    const materialImage = await prisma.documentAttachment.create({ data: {
      ownerType: 'MATERIAL', ownerId: material.id, documentType: 'MATERIAL_IMAGE',
      originalName: 'material.png', fileName: 'material.png', mimeType: 'image/png', size: 128,
      url: '/runtime/material.png', storagePath: '/runtime/material.png', isCover: true,
    } })

    const order = await createManagedSalesOrder({
      customerId: customer.id, orderDate: '2026-08-10', items: [{ materialId: material.id, qty: 100 }],
    }, fixedNow)
    const secondOrder = await createManagedSalesOrder({
      customerId: customer.id, orderDate: '2026-08-10', items: [{ materialId: material.id, qty: 5 }],
    }, fixedNow)
    await confirmManagedSalesOrder(order.id)
    await confirmManagedSalesOrder(secondOrder.id)

    const shipment = await createManagedShipment({
      customerId: customer.id,
      items: [{ materialId: material.id, locationId: location.id, qty: 30 }],
      trackingNo: 'VERIFY-TRACK', shippedBy: '验证发货员',
    }, fixedNow)
    assert.equal(shipment.items[0].materialId, material.id)
    assert.ok(!('salesOrderId' in shipment), '发货单头不得保存销售订单关联')
    assert.ok(!('salesOrderItemId' in shipment.items[0]), '发货明细不得保存销售订单明细关联')

    const beforeShip = await getShipmentCreateOptions()
    assert.equal(beforeShip.materials.find((item) => item.id === material.id)?.primaryImage?.id, materialImage.id, '发货物料选项必须提供主图')
    const pendingReference = beforeShip.data.find((item) => item.customerId === customer.id && item.materialId === material.id)
    assert.deepEqual(
      [pendingReference?.orderedQty, pendingReference?.pendingQty, pendingReference?.shippedQty, pendingReference?.remainingQty],
      [105, 30, 0, 75],
      '未发量必须按客户＋物料汇总，不绑定某张订单',
    )

    await shipManagedShipment(shipment.id, '验证发货员')
    const [storedOrder, stock, listed] = await Promise.all([
      prisma.salesOrder.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } }),
      prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } }),
      listSalesOrders({ statuses: ['CONFIRMED'], keyword: '解耦', page: 1, pageSize: 20 }),
    ])
    assert.deepEqual([storedOrder.status, storedOrder.items[0].shippedQty], ['CONFIRMED', 0], '发货不得回写销售订单')
    assert.equal(stock.qty, 90, '发货仍必须正常扣减库存')
    assert.deepEqual(
      [listed.data[0].items[0].referenceOrderedQty, listed.data[0].items[0].referenceShippedQty, listed.data[0].items[0].referenceRemainingQty],
      [105, 30, 75],
    )
    assert.equal(listed.data[0].items[0].material.primaryImage?.id, materialImage.id, '销售订单列表必须提供可选物料图片')
    const listedShipments = await listShipments({ statuses: [], page: 1, pageSize: 20 })
    assert.equal(listedShipments.data[0].items[0].material.primaryImage?.id, materialImage.id, '发货列表必须提供可选物料图片')

    await deliverManagedShipment(shipment.id)
    const returned = await createManagedReturn({
      shipmentId: shipment.id, shipmentItemId: shipment.items[0].id, locationId: location.id,
      qty: 10, reason: '客户退回验证',
    }, fixedNow)
    await processManagedReturn(returned.id, '验证退货员')
    assert.equal((await prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } })).qty, 100)

    const overShipment = await createManagedShipment({
      customerId: customer.id, items: [{ materialId: material.id, locationId: location.id, qty: 80 }],
    }, fixedNow)
    await shipManagedShipment(overShipment.id, '超发验证员')
    const overReference = (await getShipmentCreateOptions()).data.find((item) => item.customerId === customer.id && item.materialId === material.id)
    assert.deepEqual([overReference?.remainingQty, overReference?.overQty], [0, 5], '销售订单数量仅作参考，不得阻止超发')

    console.log('销售订单与发货解耦验证通过：发货只关联客户和物料，未发/超发为客户＋物料动态参考。')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
