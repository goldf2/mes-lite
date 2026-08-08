import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-sales-order-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })

async function main() {
  try {
    const { getSalesOrderItemRemainingQty, refreshSalesOrderStatus } = await import('../lib/sales-orders')
    const { getSystemSettings, updateSystemSettings } = await import('../lib/system-settings')
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [customer, material, product] = await Promise.all([
      prisma.customer.create({ data: { code: `CUS-${suffix}`, name: '销售流程验证客户' } }),
      prisma.material.create({ data: { code: `SALE-${suffix}`, name: '销售流程验证成品', category: 'FINISHED', unit: '件', stockUnit: '件', defaultSalePrice: 12.5, salesCurrency: 'CNY' } }),
      prisma.product.create({ data: { sku: `SALE-${suffix}`, name: '销售流程验证成品', category: 'FINISHED', unit: '件' } }),
    ])
    const order = await prisma.salesOrder.create({
      data: {
        orderNo: `SO-${suffix}`,
        customerId: customer.id,
        totalAmount: 1250,
        currency: 'CNY',
        items: { create: { materialId: material.id, qty: 100, unit: '件', unitPrice: 12.5, totalAmount: 1250, currency: 'CNY', priceSource: 'MATERIAL_DEFAULT', defaultSalePriceSnapshot: 12.5 } },
      },
      include: { items: true },
    })
    const item = order.items[0]
    assert.equal(material.defaultSalePrice, 12.5)
    assert.equal(item.defaultSalePriceSnapshot, 12.5)
    assert.equal(item.priceSource, 'MATERIAL_DEFAULT')

    const independentShipment = await prisma.shipment.create({
      data: {
        shipmentNo: `SH-INDEPENDENT-${suffix}`,
        productId: product.id,
        materialId: material.id,
        customerId: customer.id,
        customer: customer.name,
        qty: 1,
        unitPrice: 12.5,
        totalAmount: 12.5,
      },
    })
    assert.equal(independentShipment.salesOrderId, null)
    assert.equal(independentShipment.salesOrderItemId, null)

    await prisma.salesOrder.update({ where: { id: order.id }, data: { status: 'CONFIRMED' } })
    await prisma.shipment.create({
      data: {
        shipmentNo: `SH-${suffix}`,
        productId: product.id,
        materialId: material.id,
        customerId: customer.id,
        salesOrderId: order.id,
        salesOrderItemId: item.id,
        customer: customer.name,
        qty: 30,
        unitPrice: 10,
        totalAmount: 300,
      },
    })

    const availability = await prisma.$transaction((tx) => getSalesOrderItemRemainingQty(tx, item.id))
    assert.equal(availability.pendingQty, 30)
    assert.equal(availability.remainingQty, 70, '待发货单必须占用订单可发数量')

    await prisma.shipment.update({ where: { shipmentNo: `SH-${suffix}` }, data: { status: 'SHIPPED' } })
    await prisma.salesOrderItem.update({ where: { id: item.id }, data: { shippedQty: 30 } })
    await prisma.$transaction((tx) => refreshSalesOrderStatus(tx, order.id))
    assert.equal((await prisma.salesOrder.findUniqueOrThrow({ where: { id: order.id } })).status, 'PARTIAL')

    await prisma.salesOrderItem.update({ where: { id: item.id }, data: { shippedQty: 100 } })
    await prisma.$transaction((tx) => refreshSalesOrderStatus(tx, order.id))
    assert.equal((await prisma.salesOrder.findUniqueOrThrow({ where: { id: order.id } })).status, 'COMPLETED')

    await updateSystemSettings({
      companyName: '验证供货方',
      companyContact: '张三',
      companyPhone: '0512-00000000',
      companyAddress: '苏州市验证地址',
    }, prisma)
    const settings = await getSystemSettings(prisma)
    assert.equal(settings.companyName, '验证供货方')
    assert.equal(settings.companyPhone, '0512-00000000')

    console.log('销售订单待发占用、分批发货状态回写、发货关联及甲乙方系统资料验证通过')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
