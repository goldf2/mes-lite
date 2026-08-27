import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-shipment-packages-'))
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
    { createInventoryLotReceipt },
    { createManagedShipment },
    { shipManagedShipment, deliverManagedShipment },
    { createShipmentPackage, archiveShipmentPackage },
    { listShipmentPackages },
    { resolveScannableDocument },
    { SalesDomainError },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/inventory'),
    import('../modules/inventory'),
    import('../modules/sales/server/fulfillment-command-service'),
    import('../modules/sales/server/fulfillment-status-service'),
    import('../modules/sales/server/shipment-package-command-service'),
    import('../modules/sales/server/shipment-package-query-service'),
    import('../modules/business-documents/server/scannable-document-query-service'),
    import('../modules/sales/domain/sales-errors'),
  ])

  try {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const [location, customer, material] = await Promise.all([
      prisma.inventoryLocation.create({ data: { code: `BOX-${suffix}`, name: '装箱发货库位', isDefault: true } }),
      prisma.customer.create({ data: { code: `CUS-${suffix}`, name: '装箱扫码客户' } }),
      prisma.material.create({
        data: {
          code: `FIN-${suffix}`,
          name: '装箱扫码成品',
          category: 'FINISHED',
          unit: '件',
          stockUnit: '件',
          valuationUnit: '件',
        },
      }),
    ])

    await prisma.$transaction(async (tx) => {
      const receipt = await postInventoryReceipt(tx, {
        materialId: material.id,
        stockQty: 10,
        valuationQty: 10,
        costAmount: 100,
        type: 'VERIFY_IN',
        refType: 'VERIFY',
        refId: suffix,
        note: '货箱单据闭环期初库存',
        idempotencyKey: `VERIFY:SHIPMENT_PACKAGE:${suffix}`,
        locationId: location.id,
      })
      const lot = await createInventoryLotReceipt(tx, {
        lotNo: `BOXLOT-${suffix}`,
        materialId: material.id,
        sourceType: 'VERIFY',
        sourceId: suffix,
        locationId: location.id,
        inventoryStatus: 'AVAILABLE',
        stockQty: 10,
        valuationQty: 10,
        costAmount: 100,
        stockLogId: receipt.movement!.id,
        idempotencyKey: `VERIFY:SHIPMENT_PACKAGE:${suffix}:LOT`,
      })
      await tx.stockLog.update({
        where: { id: receipt.movement!.id },
        data: { lotId: lot.id, inventoryStatus: 'AVAILABLE' },
      })
      if (receipt.costLayer) {
        await tx.inventoryCostLayer.update({
          where: { id: receipt.costLayer.id },
          data: { lotId: lot.id, inventoryStatus: 'AVAILABLE' },
        })
      }
    })

    const shipment = await createManagedShipment({
      customerId: customer.id,
      items: [{ materialId: material.id, locationId: location.id, qty: 4 }],
      trackingNo: `TRACK-${suffix}`,
    }, new Date('2026-08-19T01:00:00.000Z'))
    const firstPackage = await createShipmentPackage(shipment.id, {
      shipmentItemId: shipment.items[0].id,
      quantity: 2,
      packedBy: '装箱验证员',
      grossWeight: 2.2,
      netWeight: 2,
      weightUnit: 'kg',
      sealNo: `SEAL-${suffix}`,
    }, '装箱验证员', new Date('2026-08-19T01:10:00.000Z'))

    assert.match(firstPackage.packageNo, /^BX-20260819-\d{3}$/)
    assert.equal(firstPackage.items[0]?.quantity, 2)
    assert.equal(firstPackage.items[0]?.materialId, material.id)
    await assert.rejects(
      () => shipManagedShipment(shipment.id, '发货验证员'),
      (error: unknown) => error instanceof SalesDomainError && /必须与发货数量/.test(error.message),
      '存在货箱时，货箱内容合计必须与发货数量一致',
    )

    const packageScan = await resolveScannableDocument(firstPackage.packageNo)
    assert.equal(packageScan?.type, 'PACKAGE_DOCUMENT')
    assert.equal(packageScan?.shipmentId, shipment.id)
    assert.match(packageScan?.href || '', /page=shipment/)
    const packageUrlScan = await resolveScannableDocument(`https://mes.example/scan?code=${firstPackage.packageNo}`)
    assert.equal(packageUrlScan?.referenceId, firstPackage.id, '二维码 URL 必须仍解析为同一货箱单据')
    const shipmentScan = await resolveScannableDocument(shipment.shipmentNo)
    assert.equal(shipmentScan?.type, 'SHIPMENT')
    assert.equal(shipmentScan?.referenceId, shipment.id)

    const secondPackage = await createShipmentPackage(shipment.id, {
      shipmentItemId: shipment.items[0].id,
      quantity: 2,
      packedBy: '装箱验证员',
      weightUnit: 'kg',
    }, '装箱验证员', new Date('2026-08-19T01:11:00.000Z'))
    assert.notEqual(secondPackage.packageNo, firstPackage.packageNo, '同日货箱单号不得重复')
    await assert.rejects(
      () => createShipmentPackage(shipment.id, {
        shipmentItemId: shipment.items[0].id,
        quantity: 1,
        packedBy: '装箱验证员',
        weightUnit: 'kg',
      }, '装箱验证员', new Date('2026-08-19T01:12:00.000Z')),
      SalesDomainError,
      '装箱数量不得超过发货单未装数量',
    )

    await shipManagedShipment(shipment.id, '发货验证员')
    const shippedPackages = await listShipmentPackages(shipment.id)
    assert.deepEqual(shippedPackages.map((item) => item.status), ['SHIPPED', 'SHIPPED'])
    await deliverManagedShipment(shipment.id, '验证签收员')
    const deliveredPackages = await listShipmentPackages(shipment.id)
    assert.deepEqual(deliveredPackages.map((item) => item.status), ['DELIVERED', 'DELIVERED'])

    const archiveShipment = await createManagedShipment({
      customerId: customer.id,
      items: [{ materialId: material.id, locationId: location.id, qty: 1 }],
    }, new Date('2026-08-19T02:00:00.000Z'))
    const archivedCandidate = await createShipmentPackage(archiveShipment.id, {
      shipmentItemId: archiveShipment.items[0].id,
      quantity: 1,
      packedBy: '装箱验证员',
      weightUnit: 'kg',
    }, '装箱验证员', new Date('2026-08-19T02:10:00.000Z'))
    await archiveShipmentPackage(archiveShipment.id, archivedCandidate.id, '装箱验证员')
    assert.equal((await listShipmentPackages(archiveShipment.id)).length, 0, '待发货货箱归档后不再参与履约')
    assert.equal(await resolveScannableDocument(archivedCandidate.packageNo), null, '归档货箱码不得继续打开单据')

    console.log('货箱单据与扫码闭环验证通过：装箱数量校验、BX/SH 解析、发货签收状态联动和归档均符合预期。')
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
