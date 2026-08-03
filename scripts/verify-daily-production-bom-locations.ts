import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-dp-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })

async function main() {
  try {
    const [{ buildDailyProductionConsumption }, { postInventoryIssue, postInventoryReceipt }] = await Promise.all([
      import('../lib/daily-production'),
      import('../lib/inventory'),
    ])
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [locationA, locationB, outputLocation] = await Promise.all([
      prisma.inventoryLocation.create({ data: { code: `RAW-A-${suffix}`, name: '原料库位 A' } }),
      prisma.inventoryLocation.create({ data: { code: `RAW-B-${suffix}`, name: '原料库位 B' } }),
      prisma.inventoryLocation.create({ data: { code: `OUTPUT-${suffix}`, name: '产出库位' } }),
    ])
    const [rawA, rawB, finished] = await Promise.all([
      prisma.material.create({ data: { code: `RAW-A-${suffix}`, name: '原料 A', category: 'RAW', unit: 'm', stockUnit: 'm', valuationUnit: 'm' } }),
      prisma.material.create({ data: { code: `RAW-B-${suffix}`, name: '原料 B', category: 'RAW', unit: '件', stockUnit: '件', valuationUnit: '件' } }),
      prisma.material.create({ data: { code: `FIN-${suffix}`, name: '验证产出', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件' } }),
    ])
    const product = await prisma.product.create({
      data: { sku: finished.code, name: finished.name, category: 'FINISHED', unit: '件' },
    })
    await prisma.bOM.create({
      data: {
        productId: product.id,
        name: '默认单原料方案',
        version: 'v1',
        isDefault: true,
        outputQuantity: 10,
        outputUnit: '件',
        items: { create: { materialId: rawA.id, quantity: 5, unit: 'm' } },
      },
    })
    const selectedBom = await prisma.bOM.create({
      data: {
        productId: product.id,
        name: '双原料方案',
        version: 'v2',
        isDefault: false,
        outputQuantity: 10,
        outputUnit: '件',
        items: {
          create: [
            { materialId: rawA.id, quantity: 3, unit: 'm' },
            { materialId: rawB.id, quantity: 2, unit: '件' },
          ],
        },
      },
    })

    await prisma.$transaction(async (tx) => {
      await postInventoryReceipt(tx, {
        materialId: rawA.id,
        stockQty: 10,
        valuationQty: 10,
        costAmount: 100,
        type: 'VERIFY_IN',
        refType: 'VERIFY',
        refId: 'raw-a',
        note: '验证入库',
        locationId: locationA.id,
      })
      await postInventoryReceipt(tx, {
        materialId: rawB.id,
        stockQty: 10,
        valuationQty: 10,
        costAmount: 50,
        type: 'VERIFY_IN',
        refType: 'VERIFY',
        refId: 'raw-b',
        note: '验证入库',
        locationId: locationB.id,
      })
    })

    await assert.rejects(
      prisma.$transaction((tx) => buildDailyProductionConsumption(
        tx,
        finished.id,
        100,
        [
          { materialId: rawA.id, locationId: locationA.id, lossMode: 'PERCENT', lossValue: 0 },
          { materialId: rawB.id, locationId: locationB.id, lossMode: 'PERCENT', lossValue: 0 },
        ],
        { bomId: selectedBom.id },
      )),
      /库存不足/,
      '保存生产记录草稿时应拒绝超过来源库位可用量的耗用',
    )

    const snapshot = await prisma.$transaction((tx) => buildDailyProductionConsumption(
      tx,
      finished.id,
      20,
      [
        { materialId: rawA.id, locationId: locationA.id, lossMode: 'PERCENT', lossValue: 0 },
        { materialId: rawB.id, locationId: locationB.id, lossMode: 'PERCENT', lossValue: 0 },
      ],
      { bomId: selectedBom.id },
    ))

    assert.equal(snapshot.bom.id, selectedBom.id)
    assert.equal(snapshot.bom.name, '双原料方案')
    assert.deepEqual(snapshot.consumptions.map((line) => [line.materialCode, line.actualQty, line.locationId]), [
      [rawA.code, 6, locationA.id],
      [rawB.code, 4, locationB.id],
    ])

    const report = await prisma.dailyProductionReport.create({
      data: {
        reportNo: `VERIFY-${suffix}`,
        reportDate: new Date(),
        finishedMaterialId: finished.id,
        consumptionLocationId: locationA.id,
        outputLocationId: outputLocation.id,
        outputQty: 20,
        workers: '验证员',
        bomId: snapshot.bom.id,
        bomName: snapshot.bom.name,
        bomVersion: snapshot.bom.version,
        bomType: 'PRODUCTION',
        bomOutputQuantity: snapshot.bom.outputQuantity,
        bomOutputUnit: snapshot.bom.outputUnit,
        consumptions: { create: snapshot.consumptions },
      },
      include: { consumptions: true },
    })

    await prisma.$transaction(async (tx) => {
      let totalCost = 0
      for (const line of report.consumptions) {
        const issue = await postInventoryIssue(tx, {
          materialId: line.materialId,
          stockQty: line.actualQty,
          type: 'PRODUCTION_CONSUME',
          refType: 'DAILY_PRODUCTION_REPORT',
          refId: report.id,
          note: '验证生产耗用',
          locationId: line.locationId,
        })
        totalCost += Number(issue.costAmount)
      }
      await postInventoryReceipt(tx, {
        materialId: finished.id,
        stockQty: report.outputQty,
        costAmount: totalCost,
        type: 'PRODUCTION_IN',
        refType: 'DAILY_PRODUCTION_REPORT',
        refId: report.id,
        note: '验证生产产出',
        locationId: outputLocation.id,
      })
    })

    const balances = await prisma.stockLocationBalance.findMany({
      include: { stock: { include: { material: true } }, location: true },
    })
    const qtyAt = (materialId: string, locationId: string) => Number(balances.find((item) => (
      item.stock.materialId === materialId && item.locationId === locationId
    ))?.qty || 0)
    assert.equal(qtyAt(rawA.id, locationA.id), 4)
    assert.equal(qtyAt(rawB.id, locationB.id), 6)
    assert.equal(qtyAt(finished.id, outputLocation.id), 20)

    console.log('生产日报选择 BOM、逐项来源库位和原子库存过账验证通过')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
