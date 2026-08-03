import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-production-actual-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })

async function main() {
  try {
    const [{ postInventoryIssue, postInventoryReceipt }, { buildProductionOrderActualLines, recalculateProductionOrderTotals }] = await Promise.all([
      import('../lib/inventory'),
      import('../lib/production-order-actual'),
    ])
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [inputLocation, outputLocation, scrapLocation] = await Promise.all([
      prisma.inventoryLocation.create({ data: { code: `INPUT-${suffix}`, name: '半成品库位' } }),
      prisma.inventoryLocation.create({ data: { code: `OUTPUT-${suffix}`, name: '成品库位' } }),
      prisma.inventoryLocation.create({ data: { code: `SCRAP-${suffix}`, name: '废料库位' } }),
    ])
    const [existingProduct, finished, scrap] = await Promise.all([
      prisma.material.create({ data: { code: `OLD-${suffix}`, name: '待二次加工产品', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件' } }),
      prisma.material.create({ data: { code: `NEW-${suffix}`, name: '二次加工后产品', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件' } }),
      prisma.material.create({ data: { code: `SCRAP-${suffix}`, name: '加工废料', category: 'SCRAP', unit: 'kg', stockUnit: 'kg', valuationUnit: 'kg' } }),
    ])
    const product = await prisma.product.create({
      data: { sku: `MAT-${finished.code}`, name: finished.name, category: finished.category, unit: finished.stockUnit },
    })
    const bom = await prisma.bOM.create({
      data: {
        productId: product.id,
        name: '二次加工方案',
        version: 'v1',
        outputQuantity: 1,
        outputUnit: '件',
        items: {
          create: [
            { materialId: existingProduct.id, outputMaterialId: finished.id, itemType: 'MATERIAL', quantity: 2, unit: '件' },
            { materialId: existingProduct.id, outputMaterialId: scrap.id, itemType: 'MATERIAL', quantity: 0.5, unit: '件' },
          ],
        },
        outputs: {
          create: [
            { materialId: finished.id, quantity: 1, unit: '件', isPrimary: true },
            { materialId: scrap.id, quantity: 0.1, unit: 'kg', isPrimary: false },
          ],
        },
      },
      include: {
        items: { include: { material: { select: { code: true, name: true, stockUnit: true, unit: true } } } },
        outputs: { include: { material: { select: { code: true, name: true, stockUnit: true, unit: true } } } },
      },
    })
    const snapshot = JSON.stringify(bom)
    const order = await prisma.productionOrder.create({
      data: {
        orderNo: `WO-${suffix}`,
        productId: product.id,
        materialId: finished.id,
        bomId: bom.id,
        bomName: bom.name,
        bomVersion: bom.version,
        bomSnapshot: snapshot,
        planQty: 5,
      },
    })

    await prisma.$transaction((tx) => postInventoryReceipt(tx, {
      materialId: existingProduct.id,
      stockQty: 20,
      valuationQty: 20,
      costAmount: 200,
      type: 'VERIFY_IN',
      refType: 'VERIFY',
      refId: 'opening',
      note: '验证二次加工投入期初库存',
      locationId: inputLocation.id,
    }))

    const lines = await prisma.$transaction((tx) => buildProductionOrderActualLines(
      tx,
      snapshot,
      [{
        materialId: existingProduct.id,
        locationId: inputLocation.id,
        lossMode: 'FIXED_PER_UNIT',
        lossValue: 0.2,
      }],
      [
        { materialId: finished.id, locationId: outputLocation.id, actualQty: 3 },
        { materialId: scrap.id, locationId: scrapLocation.id, actualQty: 0.25 },
      ],
    ))

    assert.equal(lines.inputs[0].materialId, existingProduct.id, '成品类别物料应可作为二次加工投入')
    assert.equal(lines.inputs.length, 1, '同一投入对应多个产出时应汇总为一条领料明细')
    assert.equal(lines.inputs[0].plannedQty, 7.85)
    assert.equal(lines.inputs[0].lossQty, 0.6)
    assert.equal(lines.inputs[0].actualQty, 7.85)
    assert.equal(lines.outputs.find((line) => line.isPrimary)?.actualQty, 3)
    assert.equal(lines.outputs.find((line) => line.materialId === scrap.id)?.actualQty, 0.25)

    const actual = await prisma.productionOrderActual.create({
      data: {
        actualNo: `PA-${suffix}`,
        orderId: order.id,
        actualDate: new Date(),
        workers: '验证员',
        inputs: { create: lines.inputs },
        outputs: { create: lines.outputs },
      },
      include: { inputs: true, outputs: true },
    })

    await prisma.$transaction(async (tx) => {
      const issue = await postInventoryIssue(tx, {
        materialId: existingProduct.id,
        stockQty: lines.inputs[0].actualQty,
        type: 'PRODUCTION_CONSUME',
        refType: 'PRODUCTION_ORDER_ACTUAL',
        refId: actual.id,
        note: '验证二次加工投入',
        locationId: inputLocation.id,
      })
      await postInventoryReceipt(tx, {
        materialId: finished.id,
        stockQty: 3,
        costAmount: Number(issue.costAmount || 0),
        type: 'PRODUCTION_IN',
        refType: 'PRODUCTION_ORDER_ACTUAL',
        refId: actual.id,
        note: '验证主产出',
        locationId: outputLocation.id,
      })
      await postInventoryReceipt(tx, {
        materialId: scrap.id,
        stockQty: 0.25,
        costAmount: 0,
        type: 'PRODUCTION_IN',
        refType: 'PRODUCTION_ORDER_ACTUAL',
        refId: actual.id,
        note: '验证副产出',
        locationId: scrapLocation.id,
      })
      await tx.productionOrderActual.update({ where: { id: actual.id }, data: { status: 'CONFIRMED' } })
      await recalculateProductionOrderTotals(tx, order.id)
    })

    const [inputStock, outputStock, scrapStock, updatedOrder] = await Promise.all([
      prisma.stock.findUniqueOrThrow({ where: { materialId: existingProduct.id } }),
      prisma.stock.findUniqueOrThrow({ where: { materialId: finished.id } }),
      prisma.stock.findUniqueOrThrow({ where: { materialId: scrap.id } }),
      prisma.productionOrder.findUniqueOrThrow({ where: { id: order.id } }),
    ])
    assert.equal(inputStock.qty, 12.15)
    assert.equal(outputStock.qty, 3)
    assert.equal(outputStock.totalCost, 78.5)
    assert.equal(scrapStock.qty, 0.25)
    assert.equal(updatedOrder.completeQty, 3)
    assert.equal(updatedOrder.scrapQty, 0.25)
    assert.equal(updatedOrder.status, 'RUNNING')

    console.log('生产订单 BOM 快照、逐产出转换模型、投入汇总、二次加工、多产出及库存事务验证通过')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
