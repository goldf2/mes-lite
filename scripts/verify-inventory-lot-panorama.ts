import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-lot-panorama-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
const searchRoute = readFileSync(join(process.cwd(), 'app/api/inventory-lots/route.ts'), 'utf8')
const panoramaRoute = readFileSync(join(process.cwd(), 'app/api/inventory-lots/[id]/panorama/route.ts'), 'utf8')
assert.match(searchRoute, /requireResourcePermission\('stocks', 'read'\)/, '批次搜索 API 必须校验 stocks.read')
assert.match(panoramaRoute, /requireResourcePermission\('stocks', 'read'\)/, '批次全景 API 必须校验 stocks.read')
assert.doesNotMatch(searchRoute + panoramaRoute, /['"](?:create|update|delete|grant)['"]/, '批次搜索与全景 API 必须保持只读')
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

async function main() {
  const [{ prisma }, { getInventoryLotPanorama, searchInventoryLots }] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/inventory/server/inventory-lot-panorama-service'),
  ])
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  try {
    const [location, supplier, customer, raw, finished] = await Promise.all([
      prisma.inventoryLocation.create({ data: { code: `PAN-${suffix}`, name: '全景验证库位', isDefault: true } }),
      prisma.supplier.create({ data: { code: `SUP-PAN-${suffix}`, name: '全景验证供应商' } }),
      prisma.customer.create({ data: { code: `CUS-PAN-${suffix}`, name: '全景验证客户' } }),
      prisma.material.create({ data: { code: `RAW-PAN-${suffix}`, name: '全景原料', category: 'RAW', unit: 'kg', stockUnit: 'kg', valuationUnit: 'kg' } }),
      prisma.material.create({ data: { code: `FIN-PAN-${suffix}`, name: '全景成品', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件' } }),
    ])
    const product = await prisma.product.create({ data: { sku: finished.code, materialId: finished.id, name: finished.name, category: 'FINISHED', unit: '件' } })
    const materialIn = await prisma.materialIn.create({ data: {
      inboundNo: `IN-PAN-${suffix}`, supplierId: supplier.id, materialId: raw.id, locationId: location.id,
      qty: 10, unit: 'kg', valuationQty: 10, valuationUnit: 'kg', batchNo: `HEAT-PAN-${suffix}`, status: 'RECEIVED',
    } })
    const rawLot = await prisma.inventoryLot.create({ data: {
      lotNo: `LOT-RAW-${suffix}`, materialId: raw.id, materialInId: materialIn.id, sourceType: 'MATERIAL_IN',
      sourceId: materialIn.id, supplierLotNo: materialIn.batchNo,
      balances: { create: { locationId: location.id, inventoryStatus: 'AVAILABLE', stockQty: 10, valuationQty: 10, costAmount: 100 } },
    } })
    const order = await prisma.productionOrder.create({ data: { orderNo: `WO-PAN-${suffix}`, productId: product.id, materialId: finished.id, planQty: 8, status: 'COMPLETED' } })
    const actual = await prisma.productionOrderActual.create({ data: {
      actualNo: `PA-PAN-${suffix}`, orderId: order.id, actualDate: new Date(), workers: '全景验证员', status: 'CONFIRMED',
      inputs: { create: { materialId: raw.id, locationId: location.id, materialCode: raw.code, materialName: raw.name, quantityPerBatch: 1, plannedQty: 5, actualQty: 5, unit: 'kg' } },
      outputs: { create: { materialId: finished.id, locationId: location.id, materialCode: finished.code, materialName: finished.name, quantityPerBatch: 1, plannedQty: 8, actualQty: 8, unit: '件', isPrimary: true } },
    }, include: { inputs: true, outputs: true } })
    const finishedLot = await prisma.inventoryLot.create({ data: {
      lotNo: `LOT-FIN-${suffix}`, materialId: finished.id, productionOutputId: actual.outputs[0].id,
      sourceType: 'PRODUCTION_ORDER_ACTUAL_OUTPUT', sourceId: actual.outputs[0].id,
      balances: { create: { locationId: location.id, inventoryStatus: 'AVAILABLE', stockQty: 8, valuationQty: 8, costAmount: 100 } },
      inspections: { create: { inspectionNo: `QI-PAN-${suffix}`, sourceType: 'PRODUCTION_ORDER_ACTUAL_OUTPUT', sourceId: actual.outputs[0].id, status: 'COMPLETED', result: 'PASS', inspectedQty: 8, sampleQty: 2, goodQty: 2, inspector: '全景质检员' } },
    } })
    const allocation = await prisma.inventoryLotAllocation.create({ data: {
      actualInputId: actual.inputs[0].id, lotId: rawLot.id, locationId: location.id,
      stockQty: 5, valuationQty: 5, costAmount: 50,
    } })
    await prisma.inventoryLotGenealogy.create({ data: {
      inputAllocationId: allocation.id, parentLotId: rawLot.id, childLotId: finishedLot.id,
      actualId: actual.id, outputId: actual.outputs[0].id,
    } })
    const shipment = await prisma.shipment.create({ data: {
      shipmentNo: `SH-PAN-${suffix}`, productId: product.id, materialId: finished.id, locationId: location.id,
      customerId: customer.id, customer: customer.name, qty: 3, status: 'DELIVERED', lotTraceStatus: 'TRACKED', shippedAt: new Date(),
    } })
    const shipmentAllocation = await prisma.shipmentLotAllocation.create({ data: {
      shipmentId: shipment.id, lotId: finishedLot.id, locationId: location.id, stockQty: 3, valuationQty: 3, costAmount: 37.5,
    } })
    const returnOrder = await prisma.returnOrder.create({ data: {
      returnNo: `RT-PAN-${suffix}`, shipmentId: shipment.id, productId: product.id, materialId: finished.id,
      locationId: location.id, qty: 1, reason: '全景验证退货', status: 'PROCESSED', processedAt: new Date(),
    } })
    const returnLot = await prisma.inventoryLot.create({ data: {
      lotNo: `LOT-RT-${suffix}`, materialId: finished.id, returnOrderId: returnOrder.id,
      sourceType: 'RETURN_ORDER', sourceId: returnOrder.id,
      balances: { create: { locationId: location.id, inventoryStatus: 'QUARANTINE', stockQty: 1, valuationQty: 1, costAmount: 12.5 } },
    } })
    await prisma.returnLotAllocation.create({ data: {
      returnOrderId: returnOrder.id, shipmentAllocationId: shipmentAllocation.id, returnedLotId: returnLot.id,
      stockQty: 1, valuationQty: 1, costAmount: 12.5,
    } })

    for (const [keyword, expectedLotId] of [
      [materialIn.batchNo!, rawLot.id],
      [supplier.name, rawLot.id],
      [finishedLot.lotNo, finishedLot.id],
      [customer.name, finishedLot.id],
      [shipment.shipmentNo, finishedLot.id],
      [returnOrder.returnNo, returnLot.id],
      [`QI-PAN-${suffix}`, finishedLot.id],
    ] as const) {
      const result = await searchInventoryLots({ keyword })
      assert.ok(result.items.some((item) => item.lot.id === expectedLotId), `${keyword} 必须命中目标批次`)
    }

    const panorama = await getInventoryLotPanorama(rawLot.id)
    assert.deepEqual(new Set(panorama.nodes.map((item) => item.lot.id)), new Set([rawLot.id, finishedLot.id, returnLot.id]))
    assert.deepEqual(panorama.edges.map((item) => item.type), ['PRODUCTION', 'CUSTOMER_RETURN'])
    assert.equal(panorama.nodes.find((item) => item.lot.id === rawLot.id)?.generation, 0)
    assert.equal(panorama.nodes.find((item) => item.lot.id === finishedLot.id)?.generation, 1)
    assert.equal(panorama.nodes.find((item) => item.lot.id === returnLot.id)?.generation, 2)
    assert.equal(panorama.customerShipments[0]?.shipmentNo, shipment.shipmentNo)
    assert.equal(panorama.summary.supplierLots, 1)
    assert.equal(panorama.summary.customers, 1)
    assert.equal(panorama.summary.qualityInspections, 1)

    const reverse = await getInventoryLotPanorama(returnLot.id)
    assert.equal(reverse.nodes.find((item) => item.lot.id === rawLot.id)?.generation, -2)
    assert.equal(reverse.nodes.find((item) => item.lot.id === returnLot.id)?.generation, 0)
    await assert.rejects(() => getInventoryLotPanorama('missing-lot'), /内部批次不存在/)
    console.log('批次搜索全景验证通过：供应批号、内部批号、供应商、客户、发货/退货/检验单搜索与多跳正反向全景均符合预期。')
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
