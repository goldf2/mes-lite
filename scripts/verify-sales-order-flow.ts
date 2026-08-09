import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-sales-order-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

async function main() {
  const [
    { prisma },
    { postInventoryReceipt },
    { updateSystemSettings },
    { SalesDomainError },
    { createManagedSalesOrder, confirmManagedSalesOrder, updateManagedSalesOrderPrices },
    { getSalesOrderItemRemainingQty },
    { listSalesOrders, listShippableSalesOrderItems },
    { createManagedShipment, createManagedReturn, archiveManagedShipment, archiveManagedReturn },
    { shipManagedShipment, deliverManagedShipment, cancelManagedShipment, processManagedReturn, rejectManagedReturn },
    { listShipments, getShipmentDetail, listReturns, getReturnDetail },
    { createShipmentDeliveryNote },
    { nextDatedDocumentNo },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/inventory'),
    import('../lib/system-settings'),
    import('../modules/sales/domain/sales-errors'),
    import('../modules/sales/server/sales-order-command-service'),
    import('../modules/sales/server/sales-order-availability-service'),
    import('../modules/sales/server/sales-order-query-service'),
    import('../modules/sales/server/fulfillment-command-service'),
    import('../modules/sales/server/fulfillment-status-service'),
    import('../modules/sales/server/fulfillment-query-service'),
    import('../modules/sales/server/shipment-delivery-note-service'),
    import('../modules/sales/domain/sales-document-numbering'),
  ])
  try {
    const fixedNow = new Date('2026-08-10T08:00:00.000Z')
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [customer, location, material] = await Promise.all([
      prisma.customer.create({
        data: { code: `CUS-${suffix}`, name: '销售履约验证客户', phone: '0512-12345678', address: '苏州市验证地址' },
      }),
      prisma.inventoryLocation.create({ data: { code: `SALE-${suffix}`, name: '销售验证库位', isDefault: true } }),
      prisma.material.create({
        data: {
          code: `SALE-${suffix}`, name: '销售履约验证成品', category: 'FINISHED', unit: '件',
          stockUnit: '件', valuationUnit: '件', conversionRate: 1, defaultSalePrice: 12.5, salesCurrency: 'CNY',
        },
      }),
    ])
    await prisma.$transaction((tx) => postInventoryReceipt(tx, {
      materialId: material.id, stockQty: 100, valuationQty: 100, costAmount: 1000,
      type: 'VERIFY_IN', refType: 'VERIFY', refId: 'sales-opening', note: '销售履约期初库存',
      idempotencyKey: `VERIFY:SALES:${suffix}`, locationId: location.id,
    }))

    const orderInput = {
      customerId: customer.id,
      orderDate: '2026-08-10',
      deliveryDate: '2026-08-12',
      note: '销售履约验证',
      items: [{ materialId: material.id, qty: 100 }],
    }
    const order = await createManagedSalesOrder(orderInput, fixedNow)
    const secondOrder = await createManagedSalesOrder({ ...orderInput, items: [{ materialId: material.id, qty: 5 }] }, fixedNow)
    assert.equal(order.orderNo, 'SO-20260810-001')
    assert.equal(secondOrder.orderNo, 'SO-20260810-002', '同日单据必须按最大序号递增')
    assert.equal(order.totalAmount, 1250)
    assert.deepEqual(
      [order.items[0].unitPrice, order.items[0].defaultSalePriceSnapshot, order.items[0].priceSource],
      [12.5, 12.5, 'MATERIAL_DEFAULT'],
      '销售明细必须冻结物料默认价及价格来源',
    )
    assert.equal(nextDatedDocumentNo('SO', fixedNow, 'SO-20260810-009'), 'SO-20260810-010')

    await confirmManagedSalesOrder(order.id)
    await assert.rejects(() => confirmManagedSalesOrder(order.id), SalesDomainError, '已确认订单不得重复确认')
    await confirmManagedSalesOrder(secondOrder.id)
    await assert.rejects(
      () => updateManagedSalesOrderPrices(secondOrder.id, {
        items: [{ id: secondOrder.items[0].id, unitPrice: 13.5 }],
      }, { operatorId: undefined, operatorName: '验证调价员', ipAddress: undefined, userAgent: undefined }),
      /必须填写原因/,
    )
    const repriced = await updateManagedSalesOrderPrices(secondOrder.id, {
      reason: '客户议价确认', items: [{ id: secondOrder.items[0].id, unitPrice: 13.5 }],
    }, { operatorId: undefined, operatorName: '验证调价员', ipAddress: undefined, userAgent: undefined })
    assert.deepEqual([repriced.totalAmount, repriced.items[0].priceSource], [67.5, 'MANUAL'])
    assert.equal(await prisma.auditLog.count({ where: { entityId: secondOrder.id, action: 'ADJUST_PRICE' } }), 1)

    const shipment = await createManagedShipment({
      salesOrderItemId: order.items[0].id, locationId: location.id, qty: 30,
      trackingNo: 'VERIFY-TRACK', shippedBy: '验证发货员',
    }, fixedNow)
    assert.equal(shipment.shipmentNo, 'SH-20260810-001')
    assert.deepEqual(
      [shipment.salesOrderId, shipment.salesOrderItemId, shipment.unitPrice, shipment.totalAmount],
      [order.id, order.items[0].id, 12.5, 375],
    )
    const availability = await prisma.$transaction((tx) => getSalesOrderItemRemainingQty(tx, order.items[0].id))
    assert.deepEqual([availability.pendingQty, availability.remainingQty], [30, 70], '待发货单必须占用订单可发数量')
    await assert.rejects(
      () => createManagedShipment({ salesOrderItemId: order.items[0].id, locationId: location.id, qty: 71 }, fixedNow),
      /超过订单未发数量 70/,
    )

    const listedBeforeShip = await listSalesOrders({ statuses: ['CONFIRMED'], keyword: '销售 履约', page: 1, pageSize: 20 })
    assert.equal(listedBeforeShip.pagination.total, 2, '多关键词查询必须在领域查询服务中生效')
    assert.equal((await listShippableSalesOrderItems()).data[0].remainingQty, 70)

    await shipManagedShipment(shipment.id)
    const [stockAfterShip, orderAfterShip, shipmentAfterShip] = await Promise.all([
      prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } }),
      prisma.salesOrder.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } }),
      getShipmentDetail(shipment.id),
    ])
    assert.deepEqual([stockAfterShip.qty, stockAfterShip.totalCost], [70, 700], '确认发货必须原子扣减库存与成本')
    assert.deepEqual([orderAfterShip.status, orderAfterShip.items[0].shippedQty], ['PARTIAL', 30])
    assert.deepEqual([shipmentAfterShip.status, shipmentAfterShip.shippedCostAmount], ['SHIPPED', 300])
    await assert.rejects(() => shipManagedShipment(shipment.id), /只能确认待发货状态/)
    await deliverManagedShipment(shipment.id)

    await updateSystemSettings({
      companyName: '验证供货方', companyContact: '张三', companyPhone: '0512-00000000', companyAddress: '苏州市供货地址',
    })
    const deliveryNote = await createShipmentDeliveryNote(shipment.id)
    assert.match(deliveryNote.filename, /SH-20260810-001/)
    assert.ok(deliveryNote.pdf.length > 1000, '已发货单必须可由领域服务生成 PDF')

    const returnOrder = await createManagedReturn({
      shipmentId: shipment.id, productId: shipment.productId, locationId: location.id,
      qty: 10, reason: '客户退回验证', note: '外观无损',
    }, fixedNow)
    assert.equal(returnOrder.returnNo, 'RT-20260810-001')
    await assert.rejects(
      () => createManagedReturn({
        shipmentId: shipment.id, productId: shipment.productId, locationId: location.id, qty: 21, reason: '超量验证',
      }, fixedNow),
      /超过原发货可退数量 20/,
    )
    await processManagedReturn(returnOrder.id, '验证退货员')
    const [stockAfterReturn, processedReturn] = await Promise.all([
      prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } }),
      getReturnDetail(returnOrder.id),
    ])
    assert.deepEqual([stockAfterReturn.qty, stockAfterReturn.totalCost], [80, 800], '处理退货必须按原发货成本恢复库存')
    assert.deepEqual([processedReturn.status, processedReturn.processedCostAmount], ['PROCESSED', 100])
    await assert.rejects(() => processManagedReturn(returnOrder.id, '重复处理员'), /只能处理待处理状态/)

    const rejectedReturn = await createManagedReturn({
      shipmentId: shipment.id, productId: shipment.productId, locationId: location.id, qty: 1, reason: '拒绝验证',
    }, fixedNow)
    await rejectManagedReturn(rejectedReturn.id)
    assert.equal((await getReturnDetail(rejectedReturn.id)).status, 'REJECTED')
    await assert.rejects(() => processManagedReturn(rejectedReturn.id, '验证员'), /只能处理待处理状态/)

    const independentShipment = await createManagedShipment({
      materialId: material.id, customerId: customer.id, locationId: location.id, qty: 5,
    }, fixedNow)
    assert.deepEqual(
      [independentShipment.shipmentNo, independentShipment.salesOrderId, independentShipment.unitPrice],
      ['SH-20260810-002', null, 12.5],
      '独立发货必须保留空销售来源并调用物料默认价',
    )
    await cancelManagedShipment(independentShipment.id)
    await assert.rejects(() => shipManagedShipment(independentShipment.id), /只能确认待发货状态/)

    const [shipments, returns] = await Promise.all([
      listShipments({ statuses: [], keyword: '验证 履约', page: 1, pageSize: 20 }),
      listReturns({ statuses: ['PROCESSED'], keyword: '客户 退回', page: 1, pageSize: 20 }),
    ])
    assert.equal(shipments.pagination.total, 2)
    assert.equal(returns.pagination.total, 1)

    const archivedShipment = await archiveManagedShipment(independentShipment.id)
    const archivedReturn = await archiveManagedReturn(rejectedReturn.id)
    assert.ok(archivedShipment.updated.deletedAt)
    assert.ok(archivedReturn.updated.deletedAt)

    console.log('销售履约垂直模块验证通过：订单定价、分批发货、库存成本、退货恢复、PDF、查询、归档与状态幂等符合预期')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
