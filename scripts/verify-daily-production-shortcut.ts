import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-db-'))
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
    { postInventoryReceipt },
    { unrestrictedDataScope },
    { createAndConfirmDailyProductionShortcut, listDailyProductionShortcutWorkspace },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/inventory'),
    import('../modules/identity-access'),
    import('../modules/production/server/daily-production-shortcut-service'),
  ])

  try {
    const page = readFileSync(join(root, 'modules/production/ui/DailyProductionBomEntry.tsx'), 'utf8')
    const wrapper = readFileSync(join(root, 'modules/production/ui/DailyProductionPage.tsx'), 'utf8')
    const route = readFileSync(join(root, 'app/api/daily-production-shortcut/route.ts'), 'utf8')
    const service = readFileSync(join(root, 'modules/production/server/daily-production-shortcut-service.ts'), 'utf8')
    assert.doesNotMatch(page, /\bfetch\(/, '生产日报页面必须通过领域 client 调用接口')
    assert.match(page, /BOM 快捷生产过账/, '页面必须明确 BOM 快捷转换语义')
    assert.match(page, /生产订单、派工、报工和质检/, '页面必须说明被绕过的复杂流程')
    assert.match(wrapper, /标准流程/, '生产日报入口必须说明完整生产路径')
    assert.match(wrapper, /快捷流程（当前页）/, '生产日报入口必须说明独立快捷路径')
    assert.match(wrapper, /同一批实物只能选择其中一条/, '双轨生产必须提示避免重复登记')
    assert.match(route, /requireResourcePermission\('stocks', 'update'\)/, '快捷过账必须复用库存更新权限')
    assert.doesNotMatch(route, /prisma\./, 'HTTP 适配层不得直接访问数据库')
    assert.match(service, /prisma\.\$transaction/, '日报创建、投入扣减和产出入库必须位于同一事务')
    assert.match(service, /confirmLegacyDailyProductionReportInTransaction/, '快捷服务必须复用既有 BOM 库存过账规则')

    const [inputLocation, outputLocation] = await Promise.all([
      prisma.inventoryLocation.create({ data: { code: 'RAW', name: '原料库' } }),
      prisma.inventoryLocation.create({ data: { code: 'FIN', name: '成品库' } }),
    ])
    const [raw, finished] = await Promise.all([
      prisma.material.create({ data: { code: 'RAW-01', name: '原料', category: 'RAW', unit: 'kg', stockUnit: 'kg', valuationUnit: 'kg' } }),
      prisma.material.create({ data: { code: 'FIN-01', name: '成品', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件' } }),
    ])
    const product = await prisma.product.create({ data: { sku: finished.code, name: finished.name, category: 'FINISHED', unit: '件' } })
    const bom = await prisma.bOM.create({
      data: {
        productId: product.id,
        name: '快捷日报 BOM',
        version: 'v1',
        outputQuantity: 10,
        outputUnit: '件',
        items: { create: [{ materialId: raw.id, quantity: 5, unit: 'kg' }] },
      },
    })
    await prisma.bOM.update({
      where: { id: bom.id },
      data: { status: 'RELEASED', isActive: true, isDefault: true, releasedAt: new Date() },
    })
    await prisma.$transaction((tx) => postInventoryReceipt(tx, {
      materialId: raw.id,
      stockQty: 20,
      valuationQty: 20,
      costAmount: 200,
      type: 'VERIFY_IN',
      refType: 'VERIFY',
      refId: 'daily-bom',
      note: '验证原料入库',
      locationId: inputLocation.id,
    }))

    const commonInput = {
      reportDate: '2026-08-22',
      finishedMaterialId: finished.id,
      bomId: bom.id,
      consumptionLocationId: inputLocation.id,
      outputLocationId: outputLocation.id,
      outputQty: 20,
      note: '快捷日报验证',
      consumptions: [{
        materialId: raw.id,
        locationId: inputLocation.id,
        lossMode: 'PERCENT' as const,
        lossValue: 0,
        actualQty: 10,
      }],
    }
    const report = await createAndConfirmDailyProductionShortcut(
      commonInput,
      unrestrictedDataScope,
      '验证管理员',
      { operatorName: '验证管理员' },
    )
    assert.equal(report.status, 'CONFIRMED')
    assert.equal(report.bomId, bom.id)
    assert.equal(report.workers, '快捷生产日报')
    const balances = await prisma.stockLocationBalance.findMany()
    const balanceByLocation = new Map(balances.map((item) => [item.locationId, Number(item.qty)]))
    assert.deepEqual(
      [balanceByLocation.get(inputLocation.id), balanceByLocation.get(outputLocation.id)],
      [10, 20],
      '必须按 BOM 原子扣减投入并增加产出',
    )
    assert.equal(await prisma.productionOrder.count(), 0, '快捷日报不得创建生产订单')
    assert.equal(await prisma.productionOrderActual.count(), 0, '快捷日报不得创建生产订单实绩')
    assert.equal(await prisma.qualityInspection.count(), 0, '快捷日报不得创建质检任务')
    assert.equal(await prisma.auditLog.count({ where: { entityType: 'DAILY_PRODUCTION_REPORT', action: 'CONFIRM' } }), 1)
    const restrictedWorkspace = await listDailyProductionShortcutWorkspace({
      ...unrestrictedDataScope, inventoryMode: 'LOCATIONS', locationIds: [outputLocation.id],
    })
    assert.equal(restrictedWorkspace.reports.length, 0, '库位范围不完整时不得返回日报投入明细')
    const authorizedWorkspace = await listDailyProductionShortcutWorkspace({
      ...unrestrictedDataScope, inventoryMode: 'LOCATIONS', locationIds: [inputLocation.id, outputLocation.id],
    })
    assert.equal(authorizedWorkspace.reports.length, 1, '投入和产出库位均获授权时应返回日报')

    const reportsBeforeFailure = await prisma.dailyProductionReport.count()
    await assert.rejects(
      () => createAndConfirmDailyProductionShortcut(
        { ...commonInput, outputQty: 40, consumptions: [{ ...commonInput.consumptions[0], actualQty: 30 }] },
        unrestrictedDataScope,
        '验证管理员',
        { operatorName: '验证管理员' },
      ),
      /库存不足/,
    )
    assert.equal(await prisma.dailyProductionReport.count(), reportsBeforeFailure, '扣料失败时不得留下日报草稿')
    console.log('生产日报 BOM 快捷转换验证通过：正式 BOM、原子扣料入库、成本审计、无订单与无质检、失败回滚均符合预期')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
