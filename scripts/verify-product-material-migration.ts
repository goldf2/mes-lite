import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const root = process.cwd()
const bundledTool = path.join(root, '.next', 'maintenance', 'product-material-migration.mjs')

function runMigrationTool(args: string[], databaseUrl: string) {
  return execFileSync(process.execPath, [bundledTool, ...args], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
    encoding: 'utf8',
  }).trim()
}

function runRuntimeBackup(args: string[]) {
  return execFileSync(process.execPath, ['scripts/runtime-backup.mjs', ...args], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
}

async function sha256File(filePath: string) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex')
}

async function main() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'mes-lite-product-material-migration-'))
  const dataDirectory = path.join(temporaryRoot, 'data')
  const databasePath = path.join(dataDirectory, 'source.db')
  const databaseUrl = `file:${databasePath}`
  const uploads = path.join(temporaryRoot, 'uploads')
  const backups = path.join(temporaryRoot, 'backups')
  const mappingPath = path.join(temporaryRoot, 'mapping.json')
  const auditPath = path.join(temporaryRoot, 'audit.json')
  const preflightPath = path.join(temporaryRoot, 'preflight.json')
  const unsignedPreflightPath = path.join(temporaryRoot, 'unsigned-preflight.json')
  const invalidPreflightPath = path.join(temporaryRoot, 'invalid-preflight.json')
  const failedPreflightPath = path.join(temporaryRoot, 'failed-preflight.json')
  const driftPreflightPath = path.join(temporaryRoot, 'drift-preflight.json')
  const reportPath = path.join(temporaryRoot, 'migration-report.json')
  let prisma: PrismaClient | undefined
  try {
    execFileSync(path.join(root, 'node_modules', '.bin', 'esbuild'), [
      'scripts/product-material-migration.ts', '--bundle', '--platform=node', '--format=esm',
      '--target=node20', '--external:@prisma/client', `--outfile=${bundledTool}`,
    ], { cwd: root, stdio: 'pipe' })
    await mkdir(dataDirectory)
    await mkdir(uploads)
    await mkdir(backups)
    execFileSync(path.join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
      stdio: 'pipe',
    })
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const material = await prisma.material.create({
      data: { code: 'FG-M8', name: 'M8 成品', category: 'FINISHED', unit: '件', stockUnit: '件' },
    })
    const conflictMaterial = await prisma.material.create({
      data: { code: 'FG-CONFLICT', name: '冲突成品', category: 'FINISHED', unit: '件', stockUnit: '件' },
    })
    const product = await prisma.product.create({
      data: { sku: 'MAT-FG-M8', name: 'M8 兼容产品', category: 'FINISHED', unit: '件' },
    })
    const bom = await prisma.bOM.create({
      data: {
        productId: product.id, version: 'v1', status: 'DRAFT', isDefault: false, isActive: false,
        outputs: { create: { materialId: material.id, quantity: 1, unit: '件', isPrimary: true } },
      },
    })
    await prisma.bOM.update({
      where: { id: bom.id },
      data: { status: 'RELEASED', isDefault: true, isActive: true, releasedAt: new Date() },
    })
    await prisma.bomCostRun.create({ data: { productId: product.id, bomId: bom.id, bomVersion: 'v1' } })
    await prisma.processRoute.create({
      data: { productId: product.id, name: '标准路线', isDefault: true, steps: { create: { stepNo: 10, name: '成型' } } },
    })
    await prisma.sawingCostScenario.create({
      data: {
        name: '锯切方案', productKind: 'EXISTING', productId: product.id,
        materialLength: 100, materialWeight: 1, workpieceLength: 10, bladeThickness: 1,
        rawMaterialPrice: 1, sawdustPrice: 0, scrapPrice: 0, finishedPrice: 2,
        quantity: 9, utilization: 0.9, productWeight: 0.1, sawdustWeight: 0.01,
        scrapWeight: 0, netMaterialCost: 1, materialCostPerPiece: 0.1,
        profitPerPiece: 1.9, totalRevenue: 18, totalProfit: 17.1, grossMargin: 0.95,
      },
    })
    const order = await prisma.productionOrder.create({
      data: { orderNo: 'WO-MAP-001', productId: product.id, bomId: bom.id, planQty: 10, status: 'RELEASED' },
    })
    await prisma.stockIn.create({ data: { orderId: order.id, productId: product.id, qty: 10 } })
    const shipment = await prisma.shipment.create({
      data: { shipmentNo: 'SH-MAP-001', productId: product.id, qty: 2, customer: '测试客户' },
    })
    await prisma.returnOrder.create({
      data: { returnNo: 'RT-MAP-001', shipmentId: shipment.id, productId: product.id, qty: 1, reason: '测试退货' },
    })
    await prisma.stock.create({ data: { materialId: material.id } })
    const productStock = await prisma.stock.create({ data: { productId: product.id } })

    const auditResult = JSON.parse(runMigrationTool(['audit', '--report', auditPath], databaseUrl))
    assert.equal(auditResult.readyForProductForeignKeyMigration, false)
    const auditReport = JSON.parse(await readFile(auditPath, 'utf8'))
    assert.equal(auditReport.format, 'mes-lite-model-convergence-audit')
    assert.equal(auditReport.audit.products.mappedByCodeFallback, 1)
    assert.equal(auditReport.audit.products.ambiguousCodeMappings, 0)

    const planResult = JSON.parse(runMigrationTool(['plan', '--mapping', mappingPath], databaseUrl))
    assert.equal(planResult.products, 1)
    const originalPlan = JSON.parse(await readFile(mappingPath, 'utf8'))
    assert.equal(originalPlan.materialCatalog.length, 2)
    assert.match(originalPlan.snapshotSha256, /^[a-f0-9]{64}$/)
    assert.equal(originalPlan.materialCatalog.find((item: { materialId: string }) => item.materialId === material.id).materialStockExists, true)
    assert.equal(originalPlan.products[0].candidates.length, 1)
    assert.equal(originalPlan.products[0].candidates[0].materialId, material.id)
    assert.deepEqual(originalPlan.products[0].candidates[0].evidence, ['BOM 主产出', '编码候选 FG-M8'])
    assert.equal(originalPlan.products[0].decision.stockDisposition, 'DELETE_EMPTY_PRODUCT_STOCK')

    const { applyProductMaterialMapping, ProductMaterialMigrationError } = await import('../modules/operations-tools/server/product-material-migration-service')
    await assert.rejects(
      () => applyProductMaterialMapping(prisma!, originalPlan),
      (error: unknown) => error instanceof ProductMaterialMigrationError && /confirmedBy/.test(error.message),
    )
    await writeFile(mappingPath, `${JSON.stringify(originalPlan, null, 2)}\n`)
    const databaseSha256BeforeUnsignedPreflight = await sha256File(databasePath)
    await prisma.$disconnect()
    prisma = undefined
    const unsignedPreflight = spawnSync(process.execPath, [
      bundledTool, 'preflight', '--mapping', mappingPath, '--report', unsignedPreflightPath,
    ], { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, encoding: 'utf8' })
    assert.notEqual(unsignedPreflight.status, 0)
    const unsignedPreflightReport = JSON.parse(await readFile(unsignedPreflightPath, 'utf8'))
    assert.equal(unsignedPreflightReport.status, 'FAILED')
    assert.equal(unsignedPreflightReport.readyForApply, false)
    assert.match(unsignedPreflightReport.error, /confirmedBy/)
    assert.equal(unsignedPreflightReport.databaseSha256Before, databaseSha256BeforeUnsignedPreflight)
    assert.equal(unsignedPreflightReport.databaseSha256After, databaseSha256BeforeUnsignedPreflight)
    assert.equal(await sha256File(databasePath), databaseSha256BeforeUnsignedPreflight)
    await writeFile(mappingPath, '{ invalid json\n')
    const databaseSha256BeforeInvalidPreflight = await sha256File(databasePath)
    const invalidPreflight = spawnSync(process.execPath, [
      bundledTool, 'preflight', '--mapping', mappingPath, '--report', invalidPreflightPath,
    ], { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, encoding: 'utf8' })
    assert.notEqual(invalidPreflight.status, 0)
    const invalidPreflightReport = JSON.parse(await readFile(invalidPreflightPath, 'utf8'))
    assert.equal(invalidPreflightReport.status, 'FAILED')
    assert.equal(invalidPreflightReport.readyForApply, false)
    assert.match(invalidPreflightReport.error, /JSON/)
    assert.equal(invalidPreflightReport.databaseSha256Before, databaseSha256BeforeInvalidPreflight)
    assert.equal(invalidPreflightReport.databaseSha256After, databaseSha256BeforeInvalidPreflight)
    assert.equal(await sha256File(databasePath), databaseSha256BeforeInvalidPreflight)
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })

    const confirmedPlan = structuredClone(originalPlan)
    confirmedPlan.confirmation = { confirmedBy: '集成测试确认人', confirmedAt: new Date().toISOString() }
    confirmedPlan.products[0].decision.note = '已核对 BOM 主产出、编码、单据和空库存。'
    await writeFile(mappingPath, `${JSON.stringify(confirmedPlan, null, 2)}\n`)
    const databaseSha256BeforePreflight = await sha256File(databasePath)
    await prisma.$disconnect()
    prisma = undefined
    const preflight = JSON.parse(runMigrationTool([
      'preflight', '--mapping', mappingPath, '--report', preflightPath,
    ], databaseUrl))
    assert.equal(preflight.status, 'PASS')
    assert.equal(preflight.readyForApply, true)
    assert.equal(preflight.databaseSha256Before, databaseSha256BeforePreflight)
    assert.equal(preflight.databaseSha256After, databaseSha256BeforePreflight)
    const preflightReport = JSON.parse(await readFile(preflightPath, 'utf8'))
    assert.equal(preflightReport.format, 'mes-lite-product-material-preflight')
    assert.equal(preflightReport.status, 'PASS')
    assert.equal(preflightReport.validated.products, 1)
    assert.equal(await sha256File(databasePath), databaseSha256BeforePreflight)
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })

    const preflightDriftMaterial = await prisma.material.create({
      data: { code: 'FG-PREFLIGHT-DRIFT', name: '预检漂移物料', category: 'FINISHED', unit: '件', stockUnit: '件' },
    })
    const databaseSha256BeforeDriftPreflight = await sha256File(databasePath)
    await prisma.$disconnect()
    prisma = undefined
    const driftPreflight = spawnSync(process.execPath, [
      bundledTool, 'preflight', '--mapping', mappingPath, '--report', driftPreflightPath,
    ], { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, encoding: 'utf8' })
    assert.notEqual(driftPreflight.status, 0)
    const driftPreflightReport = JSON.parse(await readFile(driftPreflightPath, 'utf8'))
    assert.equal(driftPreflightReport.status, 'FAILED')
    assert.equal(driftPreflightReport.readyForApply, false)
    assert.match(driftPreflightReport.error, /数据已变化/)
    assert.equal(driftPreflightReport.databaseSha256Before, databaseSha256BeforeDriftPreflight)
    assert.equal(driftPreflightReport.databaseSha256After, databaseSha256BeforeDriftPreflight)
    assert.equal(await sha256File(databasePath), databaseSha256BeforeDriftPreflight)
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    await prisma.material.delete({ where: { id: preflightDriftMaterial.id } })

    const missingNotePlan = structuredClone(confirmedPlan)
    missingNotePlan.products[0].decision.note = ''
    await writeFile(mappingPath, `${JSON.stringify(missingNotePlan, null, 2)}\n`)
    const databaseSha256BeforeFailedPreflight = await sha256File(databasePath)
    await prisma.$disconnect()
    prisma = undefined
    const failedPreflight = spawnSync(process.execPath, [
      bundledTool, 'preflight', '--mapping', mappingPath, '--report', failedPreflightPath,
    ], { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, encoding: 'utf8' })
    assert.notEqual(failedPreflight.status, 0)
    const failedPreflightReport = JSON.parse(await readFile(failedPreflightPath, 'utf8'))
    assert.equal(failedPreflightReport.status, 'FAILED')
    assert.equal(failedPreflightReport.readyForApply, false)
    assert.equal(failedPreflightReport.databaseSha256Before, databaseSha256BeforeFailedPreflight)
    assert.equal(failedPreflightReport.databaseSha256After, databaseSha256BeforeFailedPreflight)
    assert.match(failedPreflightReport.error, /decision.note/)
    assert.equal(await sha256File(databasePath), databaseSha256BeforeFailedPreflight)
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    await assert.rejects(
      () => applyProductMaterialMapping(prisma!, missingNotePlan),
      (error: unknown) => error instanceof ProductMaterialMigrationError && /decision.note/.test(error.message),
    )
    const conflictPlan = structuredClone(confirmedPlan)
    conflictPlan.products[0].decision.materialId = conflictMaterial.id
    conflictPlan.products[0].decision.materialCode = conflictMaterial.code
    await assert.rejects(
      () => applyProductMaterialMapping(prisma!, conflictPlan),
      (error: unknown) => error instanceof ProductMaterialMigrationError && /BOM 主产出.*冲突/.test(error.message),
    )

    const bomWithoutOutput = await prisma.bOM.create({
      data: { productId: product.id, version: 'v2', status: 'DRAFT', isDefault: false, isActive: false },
    })
    await assert.rejects(
      () => applyProductMaterialMapping(prisma!, confirmedPlan),
      (error: unknown) => error instanceof ProductMaterialMigrationError && /有且仅有一个主产出/.test(error.message),
    )
    await prisma.bOM.delete({ where: { id: bomWithoutOutput.id } })

    const driftMaterial = await prisma.material.create({
      data: { code: 'FG-DRIFT', name: '签字后新增物料', category: 'FINISHED', unit: '件', stockUnit: '件' },
    })
    await assert.rejects(
      () => applyProductMaterialMapping(prisma!, confirmedPlan),
      (error: unknown) => error instanceof ProductMaterialMigrationError && /数据已变化/.test(error.message),
    )
    await prisma.material.delete({ where: { id: driftMaterial.id } })

    await prisma.stock.update({ where: { id: productStock.id }, data: { holdQty: 1, holdCost: 10 } })
    await assert.rejects(
      () => applyProductMaterialMapping(prisma!, confirmedPlan),
      (error: unknown) => error instanceof ProductMaterialMigrationError && /独占库存非零/.test(error.message),
    )
    const failedReportPath = path.join(temporaryRoot, 'failed-migration-report.json')
    await writeFile(mappingPath, `${JSON.stringify(confirmedPlan, null, 2)}\n`)
    await prisma.$disconnect()
    prisma = undefined
    const failedApply = spawnSync(process.execPath, [
      bundledTool, 'apply', '--mapping', mappingPath,
      '--report', failedReportPath, '--backup-dir', backups, '--uploads', uploads,
      '--maintenance-confirmation', 'STOPPED_SINGLE_INSTANCE',
    ], { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, encoding: 'utf8' })
    assert.notEqual(failedApply.status, 0)
    const failedReport = JSON.parse(await readFile(failedReportPath, 'utf8'))
    assert.equal(failedReport.status, 'FAILED')
    assert.equal(failedReport.mappingTransactionCompleted, false)
    assert.match(failedReport.error, /独占库存非零/)
    assert.match(failedReport.backup.sha256, /^[a-f0-9]{64}$/)
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    await prisma.stock.update({ where: { id: productStock.id }, data: { holdQty: 0, holdCost: 0 } })
    await writeFile(mappingPath, `${JSON.stringify(confirmedPlan, null, 2)}\n`)
    await prisma.$disconnect()
    prisma = undefined

    const applied = JSON.parse(runMigrationTool([
      'apply', '--mapping', mappingPath, '--report', reportPath,
      '--backup-dir', backups, '--uploads', uploads,
      '--maintenance-confirmation', 'STOPPED_SINGLE_INSTANCE',
    ], databaseUrl))
    assert.equal(applied.changed.products, 1)
    assert.equal(applied.changed.boms, 1)
    assert.equal(applied.changed.bomCostRuns, 1)
    assert.equal(applied.changed.processRoutes, 1)
    assert.equal(applied.changed.sawingScenarios, 1)
    assert.equal(applied.changed.productionOrders, 1)
    assert.equal(applied.changed.stockIns, 1)
    assert.equal(applied.changed.shipments, 1)
    assert.equal(applied.changed.returns, 1)
    assert.equal(applied.changed.deletedEmptyProductStocks, 1)

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const [mappedProduct, mappedBom, mappedCost, mappedRoute, mappedSawing, mappedOrder, mappedStockIn, mappedShipment, mappedReturn] = await Promise.all([
      prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
      prisma.bOM.findUniqueOrThrow({ where: { id: bom.id } }),
      prisma.bomCostRun.findFirstOrThrow({ where: { productId: product.id } }),
      prisma.processRoute.findFirstOrThrow({ where: { productId: product.id } }),
      prisma.sawingCostScenario.findFirstOrThrow({ where: { productId: product.id } }),
      prisma.productionOrder.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.stockIn.findFirstOrThrow({ where: { orderId: order.id } }),
      prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      prisma.returnOrder.findFirstOrThrow({ where: { shipmentId: shipment.id } }),
    ])
    for (const row of [mappedProduct, mappedBom, mappedCost, mappedRoute, mappedSawing, mappedOrder, mappedStockIn, mappedShipment, mappedReturn]) {
      assert.equal(row.materialId, material.id)
    }
    assert.equal(await prisma.stock.count({ where: { productId: product.id } }), 0)
    const report = JSON.parse(await readFile(reportPath, 'utf8'))
    assert.match(report.mappingSha256, /^[a-f0-9]{64}$/)
    assert.match(report.backup.sha256, /^[a-f0-9]{64}$/)
    assert.equal(report.backup.databaseQuickCheck, 'ok')
    assert.equal(report.after.readyForProductForeignKeyMigration, true)
    assert.equal(report.rollback.directReverseMigration, false)

    const restoreTarget = path.join(temporaryRoot, 'rollback-candidate')
    const restored = JSON.parse(runRuntimeBackup([
      'stage-restore', '--archive', report.backup.archivePath, '--target', restoreTarget,
    ]))
    assert.equal(restored.databaseQuickCheck, 'ok')
    const restoredClient = new PrismaClient({ datasources: { db: { url: `file:${path.join(restoreTarget, 'data', 'mes_lite.db')}` } } })
    assert.equal((await restoredClient.product.findUniqueOrThrow({ where: { id: product.id } })).materialId, null)
    assert.equal((await restoredClient.productionOrder.findUniqueOrThrow({ where: { id: order.id } })).materialId, null)
    assert.equal(await restoredClient.stock.count({ where: { productId: product.id } }), 1)
    await restoredClient.$disconnect()

    console.log('Product→Material 迁移验证通过：只读预检、显式确认、签字后漂移与冲突/库存阻断、自动备份、全表回填、对账报告和非覆盖回滚候选符合预期。')
  } finally {
    if (prisma) await prisma.$disconnect()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
