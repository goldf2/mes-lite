import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-model-convergence-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`

function walk(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

function projectPath(path: string) {
  return relative(root, path).split(sep).join('/')
}

function verifyStaticBoundaries() {
  const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8')
  const allowedProductDependencyModels = new Set([
    'BOM', 'BomCostRun', 'ProcessRoute', 'SawingCostScenario', 'ProductionOrder',
    'Stock', 'StockIn', 'Shipment', 'ReturnOrder',
  ])
  const productDependencyModels = Array.from(schema.matchAll(/^model\s+(\w+)\s+\{([\s\S]*?)^\}/gm))
    .filter((match) => /^\s*productId\s+String/m.test(match[2]))
    .map((match) => match[1])
  assert.deepEqual(
    productDependencyModels.filter((model) => !allowedProductDependencyModels.has(model)),
    [],
    '不得增加新的 Product 外键模型；现有允许清单只能收缩',
  )

  const sourceFiles = [join(root, 'lib'), join(root, 'modules'), join(root, 'app')]
    .flatMap(walk)
    .filter((path) => /\.(?:ts|tsx)$/.test(path))
  const productStockWriters = sourceFiles.filter((path) => {
    const source = readFileSync(path, 'utf8')
    return /(?:stock\.(?:create|upsert)|stock:\s*\{\s*create)[\s\S]{0,500}?productId/.test(source)
  }).map(projectPath)
  assert.deepEqual(
    productStockWriters,
    ['modules/production/server/legacy-production-order-stock-in-service.ts'],
    '只有 materialId 为空的历史工单收尾允许写入 Product 库存；其他代码不得制造平行库存',
  )

  const inventoryIntegrity = readFileSync(join(root, 'modules/inventory/server/stock-integrity-service.ts'), 'utf8')
  assert.doesNotMatch(inventoryIntegrity, /PRODUCT_WITHOUT_STOCK|productsWithoutStock/, '库存补齐只服务 Material 主档')
  const dailyCommand = readFileSync(join(root, 'modules/production/server/legacy-daily-production-command-service.ts'), 'utf8')
  assert.match(dailyCommand, /createLegacyDailyProductionReport[\s\S]*410/, '旧生产日报创建入口必须稳定返回 Gone')
  assert.doesNotMatch(dailyCommand, /dailyProductionReport\.create/, '旧生产日报不得继续创建记录')
  for (const path of [
    'modules/production/server/legacy-production-order-pick-service.ts',
    'modules/production/server/legacy-production-order-report-service.ts',
    'modules/production/server/legacy-production-order-stock-in-service.ts',
  ]) {
    assert.match(readFileSync(join(root, path), 'utf8'), /legacyProductionCompatibilityError/, `${path} 必须阻止新物料工单进入旧执行表`)
  }
}

execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

async function main() {
  verifyStaticBoundaries()
  const [
    { prisma },
    { ensureProductForMaterial },
    { backfillMissingStockRecords, findStockIntegrityIssues },
    { createLegacyDailyProductionReport },
    { LegacyDailyProductionError },
    { getModelConvergenceAudit },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/material-product'),
    import('../modules/inventory/server/stock-integrity-service'),
    import('../modules/production/server/legacy-daily-production-command-service'),
    import('../modules/production/domain/legacy-daily-production-errors'),
    import('../modules/operations-tools/server/model-convergence-audit-service'),
  ])

  try {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const material = await prisma.material.create({
      data: { code: `CONVERGE-${suffix}`, name: '模型收敛验证物料', category: 'FINISHED', unit: '件', stockUnit: '件' },
    })
    const productId = await prisma.$transaction((tx) => ensureProductForMaterial(tx, material))
    assert.equal(await prisma.stock.count({ where: { productId } }), 0, '创建内部兼容 Product 不得创建平行库存')
    assert.equal(await prisma.stock.count({ where: { materialId: material.id } }), 0)

    const repaired = await backfillMissingStockRecords()
    assert.deepEqual(Object.keys(repaired), ['materials'], '库存补齐结果只允许 Material')
    assert.equal(repaired.materials.length, 1)
    assert.equal(await prisma.stock.count({ where: { materialId: material.id } }), 1)
    assert.equal(await prisma.stock.count({ where: { productId } }), 0)
    assert.equal((await findStockIntegrityIssues()).some((issue) => issue.type === 'PRODUCT_WITHOUT_STOCK'), false)

    await assert.rejects(
      () => createLegacyDailyProductionReport(),
      (error: unknown) => error instanceof LegacyDailyProductionError && error.status === 410,
      '旧生产日报必须在访问数据库前拒绝新建',
    )

    let audit = await getModelConvergenceAudit(prisma)
    assert.deepEqual(audit.products, { total: 1, mappedByCode: 1, unmapped: 0 })
    assert.equal(audit.inventory.productOnlyStocks, 0)
    assert.equal(audit.readyForProductForeignKeyMigration, true)

    const legacyProduct = await prisma.product.create({
      data: { sku: `LEGACY-${suffix}`, name: '未映射历史产品', category: 'FINISHED', unit: '件' },
    })
    await prisma.stock.create({ data: { productId: legacyProduct.id } })
    audit = await getModelConvergenceAudit(prisma)
    assert.equal(audit.products.unmapped, 1)
    assert.equal(audit.inventory.productOnlyStocks, 1)
    assert.equal(audit.inventory.riskyProductOnlyStocks, 0)
    assert.equal(audit.readyForProductForeignKeyMigration, false)

    console.log('模型收敛验证通过：Product 依赖不增长、Material 独占新库存、旧生产写入口冻结、迁移阻塞可量化')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
