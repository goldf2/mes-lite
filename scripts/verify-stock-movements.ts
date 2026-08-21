import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const verifyRoot = mkdtempSync('/tmp/ml-stock-movements-')
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

function verifyStaticBoundaries() {
  const requiredFiles = [
    'modules/inventory/client/stock-movement-api.ts',
    'modules/inventory/contracts/stock-movement.ts',
    'modules/inventory/contracts/stock-movement-route.ts',
    'modules/inventory/model/stock-movement-view.ts',
    'modules/inventory/server/stock-movement-query-service.ts',
    'modules/inventory/ui/StockMovementCollectionView.tsx',
    'modules/inventory/ui/StockMovementPageModule.tsx',
    'app/api/stock-movements/route.ts',
  ]
  for (const path of requiredFiles) assert.ok(existsSync(join(root, path)), `库存流水缺少垂直模块文件：${path}`)
  const page = read('modules/inventory/ui/StockMovementPageModule.tsx')
  const route = read('app/api/stock-movements/route.ts')
  const registry = read('lib/page-registry.ts')
  const renderer = read('app/components/shell/WorkspacePageRendererRegistry.tsx')
  assert.doesNotMatch(page, /\bfetch\(/, '库存流水页面不得直接发起 HTTP 请求')
  assert.match(page, /loadStockMovements\(/, '库存流水页面必须通过库存领域 client 读取数据')
  assert.match(page, /buildStockMovementSearchCatalog[\s\S]*ResourceAdvancedSearch/, '库存流水的智能搜索与高级搜索必须共用实际字段目录')
  assert.match(page, /usePersistedViewMode/, '库存流水必须保存卡片和列表偏好')
  assert.match(read('modules/inventory/ui/StockMovementCollectionView.tsx'), /stockMovementRelationLabel/, '库存流水必须显示原流水与冲销流水关系')
  assert.doesNotMatch(route, /@\/lib\/prisma|\bprisma\./, '库存流水 API 不得直接访问 Prisma')
  assert.ok(route.split('\n').length <= 60, '库存流水 API 必须保持薄适配层')
  assert.match(registry, /key: 'stockMovements'/, '库存流水必须进入统一页面注册表')
  assert.match(renderer, /StockMovementPageModule/, '库存流水必须通过库存领域公开入口挂载')
}

function query(overrides: Record<string, unknown> = {}) {
  return {
    keyword: '', page: 1, pageSize: 20, type: null, direction: null,
    objectCode: null, objectName: null, locationId: null, refType: null,
    refId: null, operator: null, note: null, createdDate: null,
    ...overrides,
  }
}

async function main() {
  const [{ prisma }, { createInventoryReversalMovement }, { loadStockMovementWorkspace }, { parseStockMovementQuery }, { stockMovementRelationLabel }] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/inventory'),
    import('../modules/inventory/server/stock-movement-query-service'),
    import('../modules/inventory/contracts/stock-movement-route'),
    import('../modules/inventory/model/stock-movement-view'),
  ])
  try {
    verifyStaticBoundaries()
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const location = await prisma.inventoryLocation.create({ data: { code: `LOC-${suffix}`, name: '待检区' } })
    const material = await prisma.material.create({ data: {
      code: `MOV-${suffix}`, name: '库存流水验证铝材', spec: '6061 T6', category: 'RAW',
      unit: 'kg', stockUnit: 'kg', valuationUnit: 'kg', conversionRate: 1,
    } })
    const stock = await prisma.stock.create({ data: { materialId: material.id, qty: 12, availableQty: 12, valuationQty: 12, availableValuationQty: 12, totalCost: 120 } })
    await prisma.stockLog.create({ data: {
        stockId: stock.id, locationId: location.id, type: 'IN', qty: 20,
        beforeQty: 0, afterQty: 20, valuationQty: 20, beforeValuationQty: 0, afterValuationQty: 20,
        costAmount: 200, beforeCostAmount: 0, afterCostAmount: 200,
        stockUnitSnapshot: 'kg', valuationUnitSnapshot: 'kg', refType: 'MATERIAL_IN', refId: `MI-${suffix}`,
        note: '供应商来料确认', createdBy: '入库员', createdAt: new Date('2026-08-10T02:00:00.000Z'),
    } })
    const consume = await prisma.stockLog.create({ data: {
        stockId: stock.id, locationId: location.id, type: 'PRODUCTION_CONSUME', qty: -8,
        beforeQty: 20, afterQty: 12, valuationQty: -8, beforeValuationQty: 20, afterValuationQty: 12,
        costAmount: -80, beforeCostAmount: 200, afterCostAmount: 120,
        stockUnitSnapshot: 'kg', valuationUnitSnapshot: 'kg', refType: 'PRODUCTION_ORDER_ACTUAL', refId: `PO-${suffix}`,
        note: '生产实绩耗用', createdBy: '班组长', createdAt: new Date('2026-08-10T03:00:00.000Z'),
    } })
    const reversal = await prisma.$transaction((tx) => createInventoryReversalMovement(tx, consume.id, {
      stockId: stock.id, locationId: location.id, type: 'PRODUCTION_REVERSE_CONSUME', qty: 8,
      beforeQty: 12, afterQty: 20, valuationQty: 8, beforeValuationQty: 12, afterValuationQty: 20,
      costAmount: 80, beforeCostAmount: 120, afterCostAmount: 200,
      stockUnitSnapshot: 'kg', valuationUnitSnapshot: 'kg', refType: 'PRODUCTION_ORDER_ACTUAL_REVERSE', refId: `PO-${suffix}`,
      note: '冲销生产实绩耗用', createdBy: '生产主管',
    }))

    const all = await loadStockMovementWorkspace(query())
    assert.equal(all.pagination.total, 3)
    assert.deepEqual(all.items.map((item) => item.type), ['PRODUCTION_REVERSE_CONSUME', 'PRODUCTION_CONSUME', 'IN'], '库存流水必须按发生时间倒序')
    assert.equal(all.items[0].object.code, material.code)
    assert.equal(all.items[0].location?.code, location.code)
    assert.equal(all.options.types.some((option) => option.value === 'IN'), true)
    assert.equal(all.options.refTypes.some((option) => option.value === 'MATERIAL_IN'), true)

    const intelligent = await loadStockMovementWorkspace(query({ keyword: `${material.code} 班组长` }))
    assert.deepEqual(intelligent.items.map((item) => item.type), ['PRODUCTION_CONSUME'], '空格分词必须跨字段同时匹配')
    const linked = await loadStockMovementWorkspace(query({ keyword: reversal.id }))
    assert.deepEqual(linked.items.map((item) => item.id), [consume.id], '必须可按冲销流水 ID 反查原流水')
    assert.match(stockMovementRelationLabel(linked.items[0]), /已由流水/, '原流水必须标明已被冲销')
    assert.match(stockMovementRelationLabel(all.items[0]), /冲销原流水/, '冲销流水必须标明原流水')
    const incoming = await loadStockMovementWorkspace(query({ direction: 'in', refType: 'MATERIAL_IN' }))
    assert.deepEqual(incoming.items.map((item) => item.type), ['IN'])
    const exactDate = await loadStockMovementWorkspace(query({ createdDate: '2026-08-10', type: 'PRODUCTION_CONSUME' }))
    assert.equal(exactDate.pagination.total, 1)
    const parsed = parseStockMovementQuery(new URLSearchParams('page=-1&pageSize=999&direction=invalid'))
    assert.deepEqual([parsed.page, parsed.pageSize, parsed.direction], [1, 100, null])
    console.log('库存流水验证通过：多字段分词、精确条件、方向、日期、分页、选项和模块边界符合预期')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
