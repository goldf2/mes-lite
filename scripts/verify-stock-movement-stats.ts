import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-stock-movement-stats-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

async function main() {
  const [{ prisma }, { getStockMovementStats, resolveStockMovementStatsRange }] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/inventory/server/stock-movement-stats-query-service'),
  ])
  try {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [location, otherLocation, material] = await Promise.all([
      prisma.inventoryLocation.create({ data: { code: `STAT-${suffix}`, name: '统计库位' } }),
      prisma.inventoryLocation.create({ data: { code: `STAT-OTHER-${suffix}`, name: '其他库位' } }),
      prisma.material.create({ data: { code: `STAT-${suffix}`, name: '数量统计铝材', spec: '6061', category: 'RAW', unit: 'kg', stockUnit: 'kg', valuationUnit: 'kg', conversionRate: 1 } }),
    ])
    const stock = await prisma.stock.create({ data: { materialId: material.id } })
    const at = (value: string) => new Date(value)
    await prisma.stockLog.createMany({ data: [
      { stockId: stock.id, locationId: location.id, type: 'IN', qty: 100, beforeQty: 0, afterQty: 100, valuationQty: 100, beforeValuationQty: 0, afterValuationQty: 100, costAmount: 500, refType: 'MATERIAL_IN', refId: `IN-${suffix}`, createdAt: at('2026-09-01T01:00:00.000Z') },
      { stockId: stock.id, locationId: location.id, type: 'PRODUCTION_CONSUME', qty: -30, beforeQty: 100, afterQty: 70, valuationQty: -30, beforeValuationQty: 100, afterValuationQty: 70, costAmount: -150, refType: 'PRODUCTION_ORDER_ACTUAL', refId: `PO-${suffix}`, createdAt: at('2026-09-02T01:00:00.000Z') },
      { stockId: stock.id, locationId: location.id, type: 'REVERSE_IN', qty: -10, beforeQty: 70, afterQty: 60, valuationQty: -10, beforeValuationQty: 70, afterValuationQty: 60, costAmount: -50, refType: 'MATERIAL_IN_REVERSE', refId: `IN-${suffix}`, createdAt: at('2026-09-03T01:00:00.000Z') },
      { stockId: stock.id, locationId: otherLocation.id, type: 'IN', qty: 9, beforeQty: 0, afterQty: 9, valuationQty: 9, beforeValuationQty: 0, afterValuationQty: 9, costAmount: 45, refType: 'MATERIAL_IN', refId: `OTHER-${suffix}`, createdAt: at('2026-09-02T01:00:00.000Z') },
      { stockId: stock.id, locationId: location.id, type: 'IN', qty: 999, beforeQty: 60, afterQty: 1059, valuationQty: 999, beforeValuationQty: 60, afterValuationQty: 1059, costAmount: 4995, refType: 'MATERIAL_IN', refId: `FUTURE-${suffix}`, createdAt: at('2026-09-10T01:00:00.000Z') },
    ] })

    const stats = await getStockMovementStats({ startDate: '2026-09-01', endDate: '2026-09-03', materialId: null, locationId: location.id })
    assert.equal(stats.summary.movementCount, 3, '日期范围和库位筛选必须只统计授权范围内流水')
    assert.deepEqual([stats.summary.inQty, stats.summary.outQty, stats.summary.netQty], [100, 40, 60])
    assert.deepEqual([stats.summary.incomingInQty, stats.summary.incomingOutQty, stats.summary.incomingNetQty], [100, 10, 90], '来料及来料冲销必须单独汇总')
    assert.equal(stats.byMaterial[0].code, material.code)
    assert.deepEqual(stats.byType.map((item) => item.key), ['IN|kg', 'PRODUCTION_CONSUME|kg', 'REVERSE_IN|kg'])

    const unrestricted = await getStockMovementStats({ startDate: '2026-09-02', endDate: '2026-09-02', materialId: material.id, locationId: null })
    assert.equal(unrestricted.summary.movementCount, 2, '物料筛选和结束日期应包含整天')
    assert.equal(unrestricted.summary.netQty, -21)
    assert.throws(
      () => resolveStockMovementStatsRange({ startDate: '2026-09-03', endDate: '2026-09-01' }),
      /结束日期不能早于开始日期/,
      '结束日期早于开始日期必须被拒绝',
    )
  } finally {
    const { prisma } = await import('../lib/prisma')
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
  console.log('库存数量变动统计验证通过：日期范围、来料/冲销、物料/库位聚合和无效范围校验符合预期')
}

main().catch((error) => { console.error(error); process.exit(1) })
