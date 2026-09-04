import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { costObjectInputSchema } from '../modules/bom/contracts/cost-object-schema'
import { productionCostRecordInputSchema } from '../modules/production/contracts/production-cost-record-schema'
import { saveSawingScenarioSchema } from '../modules/operations-tools/contracts/sawing-cost'

const root = process.cwd()
for (const path of [
  'app/api/cost-objects/route.ts',
  'app/api/sawing-cost-scenarios/route.ts',
  'app/api/costs/route.ts',
  'app/api/costs/stats/route.ts',
  'app/api/costs/order/[orderId]/route.ts',
]) {
  const source = readFileSync(join(root, path), 'utf8')
  assert.doesNotMatch(source, /@\/lib\/prisma|\bprisma\.|\$transaction/, `${path} 不得直接访问数据库`)
  assert.ok(source.split('\n').length <= 60, `${path} 必须保持为不超过 60 行的 HTTP 适配层`)
}

assert.equal(costObjectInputSchema.safeParse({ code: '', name: '工序' }).success, false)
assert.equal(productionCostRecordInputSchema.safeParse({ costType: 'LABOR', category: '人工', amount: -1, date: '2026-08-10' }).success, false)

const scenarioInput = saveSawingScenarioSchema.parse({
  name: '验证锯切方案',
  materialLength: 6000, materialWeight: 10, workpieceLength: 250, bladeThickness: 2,
  rawMaterialPrice: 100, sawdustPrice: 1, scrapPrice: 2, finishedPrice: 10,
  quantity: 23, utilization: 95, productWeight: 9, sawdustWeight: 0.2, scrapWeight: 0.8,
  netMaterialCost: 97, materialCostPerPiece: 4.2, profitPerPiece: 5.8,
  totalRevenue: 230, totalProfit: 133, grossMargin: 57.8,
  additionalDirectCost: 0.5, laborCost: 20, fixedCost: 5, directStageCost: 117.5,
  manufacturingCost: 122.5, fullCost: 127.5, directProfit: 112.5,
  manufacturingProfit: 107.5, fullProfit: 102.5, directMargin: 48.9,
  manufacturingMargin: 46.7, fullMargin: 44.6,
  productKind: 'TEMPORARY', laborHoursPerPiece: 0.1, machineHoursPerPiece: 0.2,
  processTemplateIds: [],
  costItems: [{
    stage: 'DIRECT', name: '材料', method: '按件', inputA: 4.2, inputB: 1, inputC: 1,
    amount: 4.2, isDeduction: false, sortOrder: 0,
  }],
})

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-cost-domain-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

async function main() {
  const [
    { prisma },
    { createCostObject },
    { listCostObjectWorkspace },
    { createSawingCostScenario, SawingCostServiceError },
    { listSawingCostWorkspace },
    { getMaterialPanorama },
    { createProductionCostRecord },
    { listProductionCostRecords, summarizeProductionCosts },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/bom/server/cost-object-command-service'),
    import('../modules/bom/server/cost-object-query-service'),
    import('../modules/operations-tools/server/sawing-cost-command-service'),
    import('../modules/operations-tools/server/sawing-cost-query-service'),
    import('../modules/materials/server/material-panorama-query-service'),
    import('../modules/production/server/production-cost-record-command-service'),
    import('../modules/production/server/production-cost-record-query-service'),
  ])

  try {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const auditContext = {
      operatorId: 'verify-production-cost', operatorName: '生产成本审计验证员',
      ipAddress: undefined, userAgent: undefined,
    }
    const costObject = await createCostObject(costObjectInputSchema.parse({
      code: `VERIFY-${suffix}`, name: '验证成本对象', objectType: 'MANUAL', unit: '件',
      materialCostPerUnit: 2, laborHoursPerUnit: 0.1, machineHoursPerUnit: 0.2, directCostPerUnit: 1,
    }))
    assert.equal(costObject.costs.length, 1, '成本对象与首版成本必须一次写入')
    assert.equal((await listCostObjectWorkspace()).costObjects.length, 1)

    await assert.rejects(
      () => createSawingCostScenario({ ...scenarioInput, productKind: 'EXISTING' }, '验证员'),
      SawingCostServiceError,
      '已有物料方案缺少物料时必须在领域服务拒绝',
    )
    const bomMaterial = await prisma.material.create({
      data: { code: `VERIFY-BOM-${suffix}`, name: '验证 BOM 物料', category: 'FINISHED', unit: '件' },
    })
    const bomProduct = await prisma.product.create({
      data: { sku: `LEGACY-BOM-${suffix}`, materialId: bomMaterial.id, name: '验证 BOM 产品', category: 'FINISHED' },
    })
    const releasedBom = await prisma.bOM.create({
      data: {
        productId: bomProduct.id, materialId: bomMaterial.id, version: 'v1',
      },
    })
    await prisma.bOM.update({
      where: { id: releasedBom.id },
      data: { status: 'RELEASED', isActive: true, isDefault: true, releasedAt: new Date() },
    })
    const scenario = await createSawingCostScenario({ ...scenarioInput, bomProductId: bomProduct.id }, '验证员')
    const [linkedCostObject, savedItems] = await Promise.all([
      prisma.costObject.findFirst({ where: { sourceType: 'SAWING_COST_SCENARIO', sourceId: scenario.id } }),
      prisma.productionCostItem.count({ where: { scenarioId: scenario.id } }),
    ])
    assert.ok(linkedCostObject, '锯切方案事务必须同步生成 BOM 可引用的成本对象')
    assert.equal(savedItems, 1, '锯切方案事务必须同步保存分项成本')
    assert.equal(await prisma.bOMItem.count({ where: { bomId: releasedBom.id } }), 0, '已发布 BOM 不得被锯切成本工具原地修改')
    const draftBom = await prisma.bOM.findFirstOrThrow({
      where: { productId: bomProduct.id, status: 'DRAFT' }, include: { items: true },
    })
    assert.equal(draftBom.version, 'v2', '向已发布 BOM 添加成本项必须派生唯一新版本')
    assert.equal(
      draftBom.items.some((item) => item.itemType === 'SAWING_COST' && item.costObjectId === linkedCostObject.id && item.sawingScenarioId === scenario.id),
      true,
      '草稿 BOM 的锯切成本项必须同时关联成本对象与原始锯切方案',
    )
    assert.equal((await listSawingCostWorkspace()).data.length, 1)

    const materialScenario = await createSawingCostScenario({
      ...scenarioInput,
      name: '物料锯切加工成本',
      productKind: 'EXISTING',
      productId: bomProduct.id,
    }, '验证员')
    const materialPanorama = await getMaterialPanorama(bomMaterial.id)
    assert.equal(
      materialPanorama.costObjects.some((item) => item.sourceType === 'SAWING_COST_SCENARIO' && item.sourceId === materialScenario.id),
      true,
      '绑定物料但未加入 BOM 的锯切成本必须在物料全景中展示',
    )

    await createProductionCostRecord(productionCostRecordInputSchema.parse({
      costType: 'LABOR', category: '验证人工', amount: 12.5, date: '2026-08-10',
    }), '验证员', auditContext)
    const list = await listProductionCostRecords({ page: 1, pageSize: 20 })
    const stats = await summarizeProductionCosts({})
    assert.deepEqual([list.pagination.total, stats.totalCost], [1, 12.5])
    assert.equal(list.data[0].createdBy, '验证员', '成本记录必须保存服务端可信操作人')
    const auditLog = await prisma.auditLog.findFirstOrThrow({
      where: { operatorId: auditContext.operatorId, entityType: 'COST_RECORD', action: 'CREATE' },
    })
    assert.equal(auditLog.entityId, list.data[0].id)
    assert.ok(auditLog.afterData, '生产成本审计必须保留创建结果快照')

    console.log('成本领域服务验证通过：BOM 成本对象、锯切方案事务及生产成本记录均已脱离 HTTP 层并通过临时数据库回归。')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
