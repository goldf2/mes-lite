import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-stock-location-adjustment-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

async function main() {
  const [{ prisma }, { postInventoryReceipt }, { adjustStock, reconcileDailyInventory }, { unrestrictedDataScope }, { findStockIntegrityIssues }] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/inventory'),
    import('../modules/inventory/server/stock-command-service'),
    import('../modules/identity-access'),
    import('../modules/inventory/server/stock-integrity-service'),
  ])
  try {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const adjustedBy = '服务器会话验证员'
    const auditContext = { operatorId: `operator-${suffix}`, operatorName: adjustedBy, ipAddress: '127.0.0.1', userAgent: '库存调整验证' }
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

    await adjustStock({
      stockId: stock.id,
      locationId: finishedLocation.id,
      newLocationQty: 4,
      newValuationQty: 7,
      newTotalCost: 140,
      reason: '成品库位盘盈',
    }, unrestrictedDataScope, adjustedBy, auditContext)
    let balances = await prisma.stockLocationBalance.findMany({ where: { stockId: stock.id } })
    let total = await prisma.stock.findUniqueOrThrow({ where: { id: stock.id } })
    assert.equal(balances.find((item) => item.locationId === rawLocation.id)?.qty, 10)
    assert.equal(balances.find((item) => item.locationId === finishedLocation.id)?.qty, 4)
    assert.deepEqual([total.qty, total.valuationQty, total.totalCost], [14, 7, 140])

    await adjustStock({
      stockId: stock.id,
      locationId: rawLocation.id,
      newLocationQty: 6,
      newValuationQty: 5,
      newTotalCost: 100,
      reason: '原料库位盘亏',
    }, unrestrictedDataScope, adjustedBy, auditContext)
    balances = await prisma.stockLocationBalance.findMany({ where: { stockId: stock.id } })
    total = await prisma.stock.findUniqueOrThrow({ where: { id: stock.id } })
    assert.equal(balances.find((item) => item.locationId === rawLocation.id)?.qty, 6)
    assert.equal(balances.find((item) => item.locationId === finishedLocation.id)?.qty, 4)
    assert.equal(total.qty, 10)
    assert.equal(balances.reduce((sum, item) => sum + Number(item.qty), 0), total.qty)

    const [dailyMaterialA, dailyMaterialB] = await Promise.all([
      prisma.material.create({ data: { code: `DAILY-A-${suffix}`, name: '日报盘点物料 A', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件', conversionRate: 1 } }),
      prisma.material.create({ data: { code: `DAILY-B-${suffix}`, name: '日报盘点物料 B', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件', conversionRate: 1 } }),
    ])
    await prisma.$transaction(async (tx) => {
      await postInventoryReceipt(tx, { materialId: dailyMaterialA.id, stockQty: 5, valuationQty: 5, costAmount: 50, type: 'VERIFY_IN', refType: 'VERIFY', refId: 'daily-a', note: '日报验证入库', locationId: finishedLocation.id })
      await postInventoryReceipt(tx, { materialId: dailyMaterialB.id, stockQty: 8, valuationQty: 8, costAmount: 80, type: 'VERIFY_IN', refType: 'VERIFY', refId: 'daily-b', note: '日报验证入库', locationId: finishedLocation.id })
    })
    const [dailyStockA, dailyStockB] = await Promise.all([
      prisma.stock.findUniqueOrThrow({ where: { materialId: dailyMaterialA.id } }),
      prisma.stock.findUniqueOrThrow({ where: { materialId: dailyMaterialB.id } }),
    ])
    const dailyResult = await reconcileDailyInventory({
      countDate: '2026-08-22',
      locationId: finishedLocation.id,
      reason: '班后实盘核对',
      items: [{ stockId: dailyStockA.id, countedQty: 6 }, { stockId: dailyStockB.id, countedQty: 8 }],
    }, unrestrictedDataScope, adjustedBy, auditContext)
    assert.deepEqual([dailyResult.adjusted.length, dailyResult.unchangedCount], [1, 1], '生产日报必须跳过账实一致行')
    assert.equal((await prisma.stock.findUniqueOrThrow({ where: { id: dailyStockA.id } })).qty, 6)
    const dailyLog = await prisma.stockLog.findFirstOrThrow({ where: { stockId: dailyStockA.id, type: 'ADJUST' }, orderBy: { createdAt: 'desc' } })
    assert.match(dailyLog.note || '', /生产日报 2026-08-22：班后实盘核对/)
    const dailyAudit = await prisma.auditLog.findFirstOrThrow({ where: { entityType: 'STOCK', entityId: dailyStockA.id, action: 'RECONCILE' } })
    assert.match(dailyAudit.note || '', /不创建生产实绩或质量记录/)
    assert.equal(await prisma.inventoryLot.count({ where: { materialId: dailyMaterialA.id, sourceType: 'DAILY_INVENTORY_COUNT' } }), 1, '盘盈必须建立可追溯的盘点批次')
    const dailyLossResult = await reconcileDailyInventory({
      countDate: '2026-08-22', locationId: finishedLocation.id, reason: '复盘确认盘亏',
      items: [{ stockId: dailyStockA.id, countedQty: 4 }, { stockId: dailyStockB.id, countedQty: 8 }],
    }, unrestrictedDataScope, adjustedBy, auditContext)
    assert.deepEqual([dailyLossResult.adjusted.length, dailyLossResult.unchangedCount], [1, 1], '盘亏整单必须仅过账差异行')
    assert.equal((await prisma.stock.findUniqueOrThrow({ where: { id: dailyStockA.id } })).qty, 4)
    assert.equal(await prisma.inventoryLotTransaction.count({ where: { refType: 'DAILY_INVENTORY_COUNT', type: 'DAILY_COUNT_OUT' } }), 1, '盘亏必须同步扣减内部批次余额')
    assert.deepEqual(await findStockIntegrityIssues(), [], '生产日报过账后必须保持库存、库位与内部批次余额一致')
    assert.equal(await prisma.dailyProductionReport.count(), 0, '快捷盘点不得恢复旧生产日报记录')
    assert.equal(await prisma.qualityInspection.count(), 0, '快捷盘点不得伪造质量作业')
    assert.throws(
      () => reconcileDailyInventory({
        countDate: '2026-08-22', locationId: finishedLocation.id, reason: '重复物品',
        items: [{ stockId: dailyStockA.id, countedQty: 6 }, { stockId: dailyStockA.id, countedQty: 7 }],
      }, unrestrictedDataScope, adjustedBy, auditContext),
      /同一物品不能在一张生产日报中重复盘点/,
    )

    await prisma.stockLocationBalance.update({
      where: { stockId_locationId: { stockId: stock.id, locationId: rawLocation.id } },
      data: { reservedQty: 2, availableQty: 4 },
    })
    await prisma.stock.update({ where: { id: stock.id }, data: { reservedQty: 2, availableQty: 8 } })
    const auditCountBeforeFailure = await prisma.auditLog.count({ where: { entityType: 'STOCK', entityId: stock.id } })
    await assert.rejects(
      adjustStock({
        stockId: stock.id,
        locationId: rawLocation.id,
        newLocationQty: 1,
        newValuationQty: 5,
        newTotalCost: 100,
        reason: '错误调整',
      }, unrestrictedDataScope, adjustedBy, auditContext),
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
    assert.deepEqual(logs.map((log) => log.createdBy), [adjustedBy, adjustedBy], '库存调整流水必须使用服务器会话操作人')
    const auditLogs = await prisma.auditLog.findMany({ where: { entityType: 'STOCK', entityId: stock.id }, orderBy: { createdAt: 'asc' } })
    assert.equal(auditLogs.length, 2, '每次成功库存调整必须在同一事务写入一条审计日志')
    assert.equal(auditLogs.every((log) => log.operatorName === adjustedBy), true)
    assert.equal(await prisma.auditLog.count({ where: { entityType: 'STOCK', entityId: stock.id } }), auditCountBeforeFailure, '失败调整不得留下孤立审计日志')

    console.log('存货调整与生产日报整单盘点的库位归属、可信操作人、事务审计、流水、账实一致跳过及流程隔离校验通过')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
