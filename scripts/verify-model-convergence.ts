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
  for (const model of ['Product', 'BOM', 'BomCostRun', 'ProcessRoute', 'SawingCostScenario', 'StockIn']) {
    const block = schema.match(new RegExp(`^model\\s+${model}\\s+\\{([\\s\\S]*?)^\\}`, 'm'))?.[1] || ''
    assert.match(block, /^\s*materialId\s+String\?/m, `${model} 必须具备可空 Material 投影，供扩展-回填-收紧迁移`)
  }
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
  const modernOrderWriters = [
    'modules/production/server/production-order-command-service.ts',
    'modules/production/server/production-order-status-service.ts',
    'modules/production/server/production-order-actual-totals.ts',
  ].map((path) => readFileSync(join(root, path), 'utf8')).join('\n')
  const oldStatusWriteLines = modernOrderWriters.split('\n').filter((line) => (
    /status:\s*'(?:CONFIRMED|PICKED|DISPATCHED|RUNNING|QC_WAITING|QC_DONE)'/.test(line)
    && !/\bwhere:/.test(line)
  ))
  assert.deepEqual(oldStatusWriteLines, [], '新 Material 工单不得重新写入旧订单状态')
  assert.match(modernOrderWriters, /releasedProductionOrderStatus/, '订单发布必须统一通过当前状态规则')
  assert.match(modernOrderWriters, /productionOrderStatusAfterActual/, '实绩累计必须统一通过当前状态规则')
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
    const compatibilityProduct = await prisma.product.findUniqueOrThrow({ where: { id: productId } })
    assert.equal(compatibilityProduct.materialId, material.id, '新兼容 Product 必须显式绑定 Material，不能只靠编码推断')
    assert.equal(await prisma.stock.count({ where: { productId } }), 0, '创建内部兼容 Product 不得创建平行库存')
    assert.equal(await prisma.stock.count({ where: { materialId: material.id } }), 0)

    const legacyMaterial = await prisma.material.create({
      data: { code: `LEGACY-MAP-${suffix}`, name: '待人工映射物料', category: 'FINISHED', unit: '件', stockUnit: '件' },
    })
    const codeMatchedLegacyProduct = await prisma.product.create({
      data: { sku: legacyMaterial.code, name: legacyMaterial.name, category: legacyMaterial.category, unit: '件' },
    })
    assert.equal(
      await prisma.$transaction((tx) => ensureProductForMaterial(tx, legacyMaterial)),
      codeMatchedLegacyProduct.id,
      '扩展阶段不得在人工映射前阻断现有业务',
    )
    assert.equal(
      (await prisma.product.findUniqueOrThrow({ where: { id: codeMatchedLegacyProduct.id } })).materialId,
      null,
      '允许旧 Product 继续工作不等于自动确认 Product→Material 映射',
    )
    await prisma.product.delete({ where: { sku: legacyMaterial.code } })
    await prisma.material.delete({ where: { id: legacyMaterial.id } })

    const ambiguousBase = `AMBIGUOUS-${suffix}`
    const ambiguousMaterial = await prisma.material.create({
      data: { code: ambiguousBase, name: '歧义候选 A', category: 'FINISHED', unit: '件', stockUnit: '件' },
    })
    const prefixedAmbiguousMaterial = await prisma.material.create({
      data: { code: `MAT-${ambiguousBase}`, name: '歧义候选 B', category: 'FINISHED', unit: '件', stockUnit: '件' },
    })
    const ambiguousProduct = await prisma.product.create({
      data: { sku: `MAT-${ambiguousBase}`, name: '歧义旧产品', category: 'FINISHED', unit: '件' },
    })
    await assert.rejects(
      () => prisma.$transaction((tx) => ensureProductForMaterial(tx, ambiguousMaterial)),
      /多个 Material 候选/,
      '编码歧义时不得按排序自动选择 Material',
    )
    const ambiguousAudit = await getModelConvergenceAudit(prisma)
    assert.equal(ambiguousAudit.products.ambiguousCodeMappings, 1)
    assert.equal(ambiguousAudit.products.mappedByCodeFallback, 0)
    assert.equal(ambiguousAudit.readyForProductForeignKeyMigration, false)
    await prisma.product.delete({ where: { id: ambiguousProduct.id } })
    await prisma.material.deleteMany({ where: { id: { in: [ambiguousMaterial.id, prefixedAmbiguousMaterial.id] } } })

    const repaired = await backfillMissingStockRecords()
    assert.deepEqual(Object.keys(repaired), ['materials'], '库存补齐结果只允许 Material')
    assert.equal(repaired.materials.length, 1)
    assert.equal(await prisma.stock.count({ where: { materialId: material.id } }), 1)
    assert.equal(await prisma.stock.count({ where: { productId } }), 0)
    assert.equal((await findStockIntegrityIssues()).some((issue) => issue.type === 'PRODUCT_WITHOUT_STOCK'), false)

    await prisma.productionOrder.create({
      data: {
        orderNo: `LEGACY-STATUS-${suffix}`,
        productId,
        materialId: material.id,
        planQty: 1,
        status: 'PICKED',
      },
    })

    await assert.rejects(
      () => createLegacyDailyProductionReport(),
      (error: unknown) => error instanceof LegacyDailyProductionError && error.status === 410,
      '旧生产日报必须在访问数据库前拒绝新建',
    )

    let audit = await getModelConvergenceAudit(prisma)
    assert.equal(audit.schema.materialProjectionMigrationApplied, true)
    assert.ok(audit.inventory && audit.productionOrderStatuses)
    assert.deepEqual(audit.products, {
      total: 1, mappedExplicitly: 1, mappedByCodeFallback: 0,
      ambiguousCodeMappings: 0, invalidExplicitMappings: 0, unmapped: 0,
    })
    assert.equal(audit.inventory.productOnlyStocks, 0)
    assert.deepEqual(audit.productionOrderStatuses.normalized, [{ status: 'RELEASED', count: 1 }])
    assert.equal(audit.productionOrderStatuses.legacyAliasRows, 1)
    assert.equal(audit.readyForProductForeignKeyMigration, true)

    const legacyProduct = await prisma.product.create({
      data: { sku: `LEGACY-${suffix}`, name: '未映射历史产品', category: 'FINISHED', unit: '件' },
    })
    await prisma.stock.create({ data: { productId: legacyProduct.id } })
    audit = await getModelConvergenceAudit(prisma)
    assert.ok(audit.inventory)
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
