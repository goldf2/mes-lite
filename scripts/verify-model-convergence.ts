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
    { ensureProductForMaterial, getProductsByMaterialId, canonicalizeProductCodes, resolveProductId },
    { backfillMissingStockRecords, findStockIntegrityIssues },
    { createLegacyDailyProductionReport },
    { LegacyDailyProductionError },
    { getModelConvergenceAudit },
    { listBoms },
    { listBomCostWorkspace },
    { listCostObjectWorkspace },
    { getMaterialPanorama },
    { listLegacyDailyProductionWorkspace },
    { listSawingCostWorkspace },
    { updateMaterial },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/material-product'),
    import('../modules/inventory/server/stock-integrity-service'),
    import('../modules/production/server/legacy-daily-production-command-service'),
    import('../modules/production/domain/legacy-daily-production-errors'),
    import('../modules/operations-tools/server/model-convergence-audit-service'),
    import('../modules/bom/server/bom-query-service'),
    import('../modules/bom/server/bom-cost-query-service'),
    import('../modules/bom/server/cost-object-query-service'),
    import('../modules/materials/server/material-panorama-query-service'),
    import('../modules/production/server/legacy-daily-production-query-service'),
    import('../modules/operations-tools/server/sawing-cost-query-service'),
    import('../modules/materials/server/material-command-service'),
  ])

  try {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const material = await prisma.material.create({
      data: { code: `CONVERGE-${suffix}`, name: '模型收敛验证物料', category: 'FINISHED', unit: '件', stockUnit: '件' },
    })
    const productId = await prisma.$transaction((tx) => ensureProductForMaterial(tx, material))
    const compatibilityProduct = await prisma.product.findUniqueOrThrow({ where: { id: productId } })
    assert.equal(compatibilityProduct.materialId, material.id, '新兼容 Product 必须显式绑定 Material，不能只靠编码推断')
    assert.equal(compatibilityProduct.sku, material.code, '新兼容 Product 必须直接使用真实物料编码')
    assert.equal(await prisma.stock.count({ where: { productId } }), 0, '创建内部兼容 Product 不得创建平行库存')
    assert.equal(await prisma.stock.count({ where: { materialId: material.id } }), 0)

    const legacyMaterial = await prisma.material.create({
      data: { code: `LEGACY-MAP-${suffix}`, name: '待人工映射物料', category: 'FINISHED', unit: '件', stockUnit: '件' },
    })
    const codeMatchedLegacyProduct = await prisma.product.create({
      data: { sku: `MAT-${legacyMaterial.code}`, name: legacyMaterial.name, category: legacyMaterial.category, unit: '件' },
    })
    assert.equal(
      await prisma.$transaction((tx) => ensureProductForMaterial(tx, legacyMaterial)),
      codeMatchedLegacyProduct.id,
      '无歧义旧 Product 必须原位复用，保留历史业务引用',
    )
    assert.equal(
      (await prisma.product.findUniqueOrThrow({ where: { id: codeMatchedLegacyProduct.id } })).materialId,
      legacyMaterial.id,
      '唯一旧 Product 候选复用后必须持久化 Material 映射',
    )
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: codeMatchedLegacyProduct.id } })).sku, legacyMaterial.code)
    await prisma.product.delete({ where: { id: codeMatchedLegacyProduct.id } })
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
    assert.equal((await getProductsByMaterialId(prisma, [ambiguousProduct])).size, 0, '只传入一个旧 Product 也必须检查完整 Material 候选')
    assert.equal((await canonicalizeProductCodes(prisma, [ambiguousProduct]))[0].sku, ambiguousProduct.sku, '歧义旧编码不能截断为另一个真实物料编码')
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

    const renamedMaterial = await prisma.material.update({ where: { id: material.id }, data: { code: `${material.code}-RENAMED` } })
    const bom = await prisma.bOM.create({
      data: {
        productId, materialId: material.id, name: '统一编码回归 BOM',
        outputs: { create: { materialId: material.id, quantity: 1, unit: '件', isPrimary: true } },
      },
    })
    await prisma.bOM.update({ where: { id: bom.id }, data: { status: 'RELEASED', isActive: true, isDefault: true } })
    await prisma.bomCostRun.create({ data: { productId, materialId: material.id, bomId: bom.id } })
    const [bomWorkspace, costWorkspace, costObjects, panorama, dailyWorkspace] = await Promise.all([
      listBoms(), listBomCostWorkspace(), listCostObjectWorkspace(), getMaterialPanorama(material.id), listLegacyDailyProductionWorkspace({}),
    ])
    assert.equal(bomWorkspace.products.find((item) => item.sourceMaterialId === material.id)?.bom?.id, bom.id, '物料改码后 BOM 必须继续按显式映射关联')
    assert.equal(costWorkspace.products.find((item) => item.sourceMaterialId === material.id)?.bom?.id, bom.id)
    assert.equal(costObjects.products.find((item) => item.sourceMaterialId === material.id)?.bom?.id, bom.id)
    assert.equal(dailyWorkspace.materials.find((item) => item.id === material.id)?.bom?.id, bom.id)
    assert.equal(panorama.productBoms[0]?.product.sku, renamedMaterial.code, '全景必须投影改码后的真实物料编码')
    assert.equal(costWorkspace.runs[0]?.product.sku, renamedMaterial.code)
    assert.equal(costObjects.recentRuns[0]?.product.sku, renamedMaterial.code)
    assert.equal(await prisma.$transaction((tx) => ensureProductForMaterial(tx, renamedMaterial)), productId, '改码后必须继续复用原 Product')
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).sku, renamedMaterial.code)

    const editInput = {
      id: material.id, code: `${material.code}-EDITED`, name: '实际物料编辑回归', category: 'FINISHED' as const,
      unit: renamedMaterial.unit, stockUnit: renamedMaterial.stockUnit, valuationUnit: renamedMaterial.valuationUnit,
      primaryMeasure: 'QUANTITY' as const,
    }
    const auditContext = async () => ({ operatorName: '统一编码自动验证' })
    const edited = await updateMaterial(editInput, auditContext)
    const editedProduct = await prisma.product.findUniqueOrThrow({ where: { id: productId } })
    assert.equal(edited.material.code, editInput.code)
    assert.equal(editedProduct.materialId, material.id)
    assert.equal(editedProduct.sku, edited.material.code, '实际物料编辑必须同事务同步兼容编码')
    assert.equal(editedProduct.name, edited.material.name)
    assert.equal((await prisma.bOM.findUniqueOrThrow({ where: { id: bom.id } })).productId, productId, '改码不得替换 Product 或重建 BOM 关联')
    assert.equal(await prisma.$transaction((tx) => resolveProductId(tx, productId)), productId, '原 Product ID 必须解析回同一显式物料身份')
    await assert.rejects(() => prisma.$transaction((tx) => resolveProductId(tx, legacyProduct.id)), /无法唯一关联物料/, '原 Product ID 不得绕过物料身份校验')

    const occupiedCode = `OCCUPIED-${suffix}`
    const occupiedProduct = await prisma.product.create({ data: { sku: occupiedCode, name: '占用目标编码的历史产品', category: 'FINISHED', unit: '件' } })
    await prisma.product.update({ where: { id: productId }, data: { sku: `MAT-${edited.material.code}` } })
    const beforeConflict = await prisma.product.findUniqueOrThrow({ where: { id: productId } })
    await assert.rejects(() => updateMaterial({ ...editInput, code: occupiedCode, name: '不应落库' }, auditContext), /占用/, '目标编码已被其他 Product 占用时必须拒绝改码')
    assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: material.id } })).code, edited.material.code)
    assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: material.id } })).name, edited.material.name)
    assert.deepEqual(await prisma.product.findUniqueOrThrow({ where: { id: productId } }), beforeConflict, '改码失败时连事务内已执行的旧 SKU 归一化也必须回滚')
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: occupiedProduct.id } })).materialId, null)

    const unlinkedMaterial = await prisma.material.create({ data: { code: `UNLINKED-${suffix}`, name: '尚无兼容产品的物料', category: 'FINISHED', unit: '件' } })
    const unlinkedEdit = { ...editInput, id: unlinkedMaterial.id, name: unlinkedMaterial.name, code: occupiedCode }
    await assert.rejects(() => updateMaterial(unlinkedEdit, auditContext), /占用/, '尚无 Product 的物料也不得通过改码抢占旧 Product 身份')
    assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: unlinkedMaterial.id } })).code, unlinkedMaterial.code)
    assert.equal(await prisma.product.count({ where: { materialId: unlinkedMaterial.id } }), 0)
    const occupiedLegacyCode = `OCCUPIED-LEGACY-${suffix}`
    const occupiedLegacyProduct = await prisma.product.create({ data: { sku: `MAT-${occupiedLegacyCode}`, name: '目标旧前缀产品', category: 'FINISHED', unit: '件' } })
    await assert.rejects(() => updateMaterial({ ...unlinkedEdit, code: occupiedLegacyCode }, auditContext), /占用/, '无原 Product 改码不能引入目标旧前缀的隐式绑定')
    await assert.rejects(() => updateMaterial({ ...editInput, code: occupiedLegacyCode }, auditContext), /占用/, '已有 Product 改码也不能制造第二个旧前缀候选')
    assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: material.id } })).code, edited.material.code)
    assert.deepEqual(await prisma.product.findUniqueOrThrow({ where: { id: productId } }), beforeConflict)
    assert.equal((await prisma.material.findUniqueOrThrow({ where: { id: unlinkedMaterial.id } })).code, unlinkedMaterial.code)
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: occupiedLegacyProduct.id } })).materialId, null)

    const baseCode = `REAL-PREFIX-${suffix}`
    const distinctMaterials = await Promise.all([baseCode, `MAT-${baseCode}`].map((code) => prisma.material.create({
      data: { code, name: code, category: 'FINISHED', unit: '件', stockUnit: '件' },
    })))
    const distinctProductIds = []
    for (const item of [...distinctMaterials].reverse()) {
      distinctProductIds.push(await prisma.$transaction((tx) => ensureProductForMaterial(tx, item)))
    }
    const distinctProducts = await prisma.product.findMany({ where: { id: { in: distinctProductIds } } })
    const distinctByMaterialId = await getProductsByMaterialId(prisma, distinctProducts)
    for (const item of distinctMaterials) assert.equal(distinctByMaterialId.get(item.id)?.sku, item.code, '真实 MAT-X 与 X 必须保留各自编码与身份')
    const sawWorkspace = await listSawingCostWorkspace()
    assert.equal(sawWorkspace.products.length, await prisma.material.count({ where: { deletedAt: null } }), '锯切候选必须每个 Material 恰好一条')
    assert.equal(new Set(sawWorkspace.products.map((item) => item.sourceMaterialId)).size, sawWorkspace.products.length)
    assert.ok(sawWorkspace.products.every((item) => item.id === `material:${item.sourceMaterialId}`), '历史 Product 不能混入可选物料')
    for (const item of distinctMaterials) assert.equal(sawWorkspace.products.find((option) => option.sourceMaterialId === item.id)?.sku, item.code)

    const duplicateMaterial = await prisma.material.create({
      data: { code: `DUPLICATE-${suffix}`, name: '重复旧映射', category: 'FINISHED', unit: '件', stockUnit: '件' },
    })
    const duplicateProducts = await Promise.all([duplicateMaterial.code, `MAT-${duplicateMaterial.code}`].map((sku) => prisma.product.create({
      data: { sku, name: duplicateMaterial.name, category: duplicateMaterial.category, unit: '件' },
    })))
    assert.equal((await getProductsByMaterialId(prisma, duplicateProducts.slice(0, 1))).size, 0, '查询分页只返回一个 Product 时仍须检查完整同物料 Product 候选')

    console.log('模型收敛验证通过：统一真实物料编码、显式关联可承受改码、旧映射消歧、候选不重复及库存/生产边界完整')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
