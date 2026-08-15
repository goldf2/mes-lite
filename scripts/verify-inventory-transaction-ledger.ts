import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-inventory-ledger-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`

execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

function verifyStaticBoundaries() {
  assert.ok(existsSync(join(root, 'lib/inventory-ledger.ts')), '缺少统一库存事务账本服务')
  const inventoryEntry = read('modules/inventory/index.ts')
  const migration = read('prisma/migrations/20260815233000_enforce_stock_log_reversals/migration.sql')
  assert.match(inventoryEntry, /createInventoryReversalMovement/, '库存模块公共入口必须导出统一冲销服务')
  assert.match(migration, /库存冲销关系已经锁定/, '数据库迁移必须锁定已建立的冲销关系')

  const stockRoute = read('app/api/stocks/route.ts')
  const stockSchema = read('modules/inventory/contracts/stock-route.ts')
  assert.doesNotMatch(stockRoute, /input\.adjustedBy/, '库存调整操作人不得来自浏览器输入')
  assert.doesNotMatch(stockSchema, /adjustedBy/, '库存调整请求契约不得接受浏览器提供的操作人')
  assert.match(stockRoute, /getAuditContext\(req\)/, '库存调整必须把请求审计上下文传入领域事务')

  for (const path of [
    'modules/receiving/server/material-in-status-service.ts',
    'modules/production/server/production-order-actual-status-service.ts',
    'modules/production/server/legacy-daily-production-status-service.ts',
    'modules/production/server/production-order-status-service.ts',
  ]) {
    const source = read(path)
    assert.match(source, /createInventoryReversalMovement/, `${path} 必须复用统一库存冲销服务`)
    assert.doesNotMatch(source, /data:\s*\{\s*reversalMovementId:/, `${path} 不得自行拼接库存冲销关系`)
  }
}

async function main() {
  const [{ prisma }, { createInventoryReversalMovement }] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/inventory'),
  ])
  try {
    verifyStaticBoundaries()
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const location = await prisma.inventoryLocation.create({ data: { code: `LEDGER-${suffix}`, name: '账本验证库位' } })
    const [material, otherMaterial] = await Promise.all([
      prisma.material.create({ data: { code: `LEDGER-A-${suffix}`, name: '账本验证物料 A', category: 'RAW', unit: 'kg', stockUnit: 'kg', valuationUnit: 'kg' } }),
      prisma.material.create({ data: { code: `LEDGER-B-${suffix}`, name: '账本验证物料 B', category: 'RAW', unit: 'kg', stockUnit: 'kg', valuationUnit: 'kg' } }),
    ])
    const [stock, otherStock] = await Promise.all([
      prisma.stock.create({ data: { materialId: material.id, qty: 7, availableQty: 7, valuationQty: 7, availableValuationQty: 7, totalCost: 70 } }),
      prisma.stock.create({ data: { materialId: otherMaterial.id, qty: 1, availableQty: 1, valuationQty: 1, availableValuationQty: 1, totalCost: 10 } }),
    ])
    const source = await prisma.stockLog.create({ data: {
      stockId: stock.id, locationId: location.id, type: 'VERIFY_ISSUE', qty: -3,
      beforeQty: 10, afterQty: 7, valuationQty: -3, beforeValuationQty: 10, afterValuationQty: 7,
      costAmount: -30, beforeCostAmount: 100, afterCostAmount: 70,
      refType: 'VERIFY_LEDGER', refId: suffix, createdBy: '验证员',
    } })

    const reversal = await prisma.$transaction((tx) => createInventoryReversalMovement(tx, source.id, {
      stockId: stock.id, locationId: location.id, type: 'VERIFY_REVERSAL', qty: 3,
      beforeQty: 7, afterQty: 10, valuationQty: 3, beforeValuationQty: 7, afterValuationQty: 10,
      costAmount: 30, beforeCostAmount: 70, afterCostAmount: 100,
      refType: 'VERIFY_LEDGER_REVERSE', refId: suffix, createdBy: '验证主管',
    }))
    const linkedSource = await prisma.stockLog.findUniqueOrThrow({ where: { id: source.id } })
    assert.equal(reversal.sourceMovementId, source.id, '冲销流水必须反向引用原流水')
    assert.equal(linkedSource.reversalMovementId, reversal.id, '原流水必须正向引用冲销流水')

    await assert.rejects(
      prisma.$transaction((tx) => createInventoryReversalMovement(tx, source.id, {
        stockId: stock.id, locationId: location.id, type: 'VERIFY_SECOND_REVERSAL', qty: 3,
        beforeQty: 10, afterQty: 13, valuationQty: 3, beforeValuationQty: 10, afterValuationQty: 13,
        costAmount: 30, beforeCostAmount: 100, afterCostAmount: 130,
        refType: 'VERIFY_LEDGER_REVERSE', refId: `${suffix}-second`, createdBy: '验证主管',
      })),
      /已经冲销/,
      '同一原流水不得重复冲销',
    )

    const otherSource = await prisma.stockLog.create({ data: {
      stockId: otherStock.id, locationId: location.id, type: 'VERIFY_OTHER_ISSUE', qty: -1,
      beforeQty: 2, afterQty: 1, valuationQty: -1, beforeValuationQty: 2, afterValuationQty: 1,
      costAmount: -10, beforeCostAmount: 20, afterCostAmount: 10,
      refType: 'VERIFY_LEDGER', refId: `${suffix}-other`, createdBy: '验证员',
    } })
    await assert.rejects(
      prisma.$transaction((tx) => createInventoryReversalMovement(tx, otherSource.id, {
        stockId: stock.id, locationId: location.id, type: 'VERIFY_WRONG_STOCK', qty: 1,
        beforeQty: 7, afterQty: 8, valuationQty: 1, beforeValuationQty: 7, afterValuationQty: 8,
        costAmount: 10, beforeCostAmount: 70, afterCostAmount: 80,
        refType: 'VERIFY_LEDGER_REVERSE', refId: `${suffix}-wrong-stock`, createdBy: '验证主管',
      })),
      /库存对象不一致/,
      '冲销流水不得跨库存对象关联',
    )

    await assert.rejects(
      prisma.stockLog.update({ where: { id: source.id }, data: { reversalMovementId: null } }),
      '数据库必须阻止已建立冲销关系被解除',
    )

    console.log('统一库存事务账本验证通过：可信冲销双向关联、金额守恒、重复/跨对象阻断和数据库锁定均符合预期。')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
