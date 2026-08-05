import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-stock-location-adjustment-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })

async function main() {
  try {
    const { postInventoryReceipt } = await import('../lib/inventory')
    const { postStockLocationAdjustment } = await import('../lib/stock-adjustment')
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [rawLocation, finishedLocation] = await Promise.all([
      prisma.inventoryLocation.create({ data: { code: `RAW-${suffix}`, name: '原料库位', isDefault: true } }),
      prisma.inventoryLocation.create({ data: { code: `FIN-${suffix}`, name: '成品库位' } }),
    ])
    const material = await prisma.material.create({
      data: {
        code: `ADJUST-${suffix}`,
        name: '库位调整验证物料',
        category: 'RAW',
        unit: '件',
        stockUnit: '件',
        valuationUnit: 'kg',
        conversionRate: 0.5,
      },
    })

    await prisma.$transaction((tx) => postInventoryReceipt(tx, {
      materialId: material.id,
      stockQty: 10,
      valuationQty: 5,
      costAmount: 100,
      type: 'VERIFY_IN',
      refType: 'VERIFY',
      refId: 'opening',
      note: '验证期初入库',
      locationId: rawLocation.id,
    }))
    const stock = await prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } })

    await prisma.$transaction((tx) => postStockLocationAdjustment(tx, {
      stockId: stock.id,
      locationId: finishedLocation.id,
      newLocationQty: 4,
      newValuationQty: 7,
      newTotalCost: 140,
      reason: '成品库位盘盈',
      adjustedBy: '验证员',
    }))
    let balances = await prisma.stockLocationBalance.findMany({ where: { stockId: stock.id } })
    let total = await prisma.stock.findUniqueOrThrow({ where: { id: stock.id } })
    assert.equal(balances.find((item) => item.locationId === rawLocation.id)?.qty, 10)
    assert.equal(balances.find((item) => item.locationId === finishedLocation.id)?.qty, 4)
    assert.deepEqual([total.qty, total.valuationQty, total.totalCost], [14, 7, 140])

    await prisma.$transaction((tx) => postStockLocationAdjustment(tx, {
      stockId: stock.id,
      locationId: rawLocation.id,
      newLocationQty: 6,
      newValuationQty: 5,
      newTotalCost: 100,
      reason: '原料库位盘亏',
      adjustedBy: '验证员',
    }))
    balances = await prisma.stockLocationBalance.findMany({ where: { stockId: stock.id } })
    total = await prisma.stock.findUniqueOrThrow({ where: { id: stock.id } })
    assert.equal(balances.find((item) => item.locationId === rawLocation.id)?.qty, 6)
    assert.equal(balances.find((item) => item.locationId === finishedLocation.id)?.qty, 4)
    assert.equal(total.qty, 10)
    assert.equal(balances.reduce((sum, item) => sum + Number(item.qty), 0), total.qty)

    await prisma.stockLocationBalance.update({
      where: { stockId_locationId: { stockId: stock.id, locationId: rawLocation.id } },
      data: { reservedQty: 2, availableQty: 4 },
    })
    await prisma.stock.update({ where: { id: stock.id }, data: { reservedQty: 2, availableQty: 8 } })
    await assert.rejects(
      prisma.$transaction((tx) => postStockLocationAdjustment(tx, {
        stockId: stock.id,
        locationId: rawLocation.id,
        newLocationQty: 1,
        newValuationQty: 5,
        newTotalCost: 100,
        reason: '错误调整',
        adjustedBy: '验证员',
      })),
      /不能小于该库位已预留数量/,
    )

    const logs = await prisma.stockLog.findMany({
      where: { stockId: stock.id, type: 'ADJUST' },
      orderBy: { createdAt: 'asc' },
    })
    assert.deepEqual(logs.map((log) => [log.locationId, log.qty, log.beforeQty, log.afterQty]), [
      [finishedLocation.id, 4, 10, 14],
      [rawLocation.id, -4, 14, 10],
    ])

    console.log('存货调整库位归属、总库存汇总、流水及库位预留校验通过')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
