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
    { reverseLegacyDailyProductionReport },
    { decideQualityInspection },
    { dailyProductionBomCandidates, dailyProductionInputMaterials, dailyProductionOutputMaterials },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/inventory'),
    import('../modules/identity-access'),
    import('../modules/production/server/daily-production-shortcut-service'),
    import('../modules/production/server/legacy-daily-production-status-service'),
    import('../modules/quality/server/quality-inspection-service'),
    import('../modules/production/model/daily-production-bom-selection'),
  ])

  try {
    const page = readFileSync(join(root, 'modules/production/ui/DailyProductionBomEntry.tsx'), 'utf8')
    const wrapper = readFileSync(join(root, 'modules/production/ui/DailyProductionPage.tsx'), 'utf8')
    const route = readFileSync(join(root, 'app/api/daily-production-shortcut/route.ts'), 'utf8')
    const service = readFileSync(join(root, 'modules/production/server/daily-production-shortcut-service.ts'), 'utf8')
    assert.doesNotMatch(page, /\bfetch\(/, '生产日报页面必须通过领域 client 调用接口')
    assert.match(page, /快捷生产 \/ 转换过账/, '页面必须明确快捷生产与转换语义')
    assert.match(page, /BOM 是可选预设/, '页面必须明确 BOM 不是实际过账的强制约束')
    assert.match(page, /多个实际产出/, '页面必须支持多产出')
    assert.match(page, /计划产出/, '生产日报必须默认提供计划产出选择')
    assert.match(page, /已有投入物料/, '生产日报必须保留投入物料辅助选择')
    assert.match(page, /dailyProductionBomCandidates/, '生产日报必须按产出、投入或两者交集反查正式 BOM')
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
    const [raw, finished, byproduct] = await Promise.all([
      prisma.material.create({ data: { code: 'RAW-01', name: '原料', category: 'RAW', unit: 'kg', stockUnit: 'kg', valuationUnit: 'kg' } }),
      prisma.material.create({ data: { code: 'FIN-01', name: '成品', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件' } }),
      prisma.material.create({ data: { code: 'BY-01', name: '回收料', category: 'OTHER', unit: 'kg', stockUnit: 'kg', valuationUnit: 'kg' } }),
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
        outputs: { create: [
          { materialId: finished.id, quantity: 10, unit: '件', isPrimary: true },
          { materialId: byproduct.id, quantity: 1, unit: 'kg', isPrimary: false },
        ] },
      },
    })
    await prisma.bOM.update({
      where: { id: bom.id },
      data: { status: 'RELEASED', isActive: true, isDefault: true, releasedAt: new Date() },
    })
    const selectionMaterials = [{
      id: finished.id,
      code: finished.code,
      name: finished.name,
      stockUnit: finished.stockUnit,
      unit: finished.unit,
      boms: [{
        id: bom.id,
        name: bom.name,
        version: bom.version,
        isDefault: true,
        isActive: true,
        outputQuantity: bom.outputQuantity,
        outputUnit: bom.outputUnit,
        outputs: [
          { id: `${bom.id}-out-main`, materialId: finished.id, quantity: 10, unit: '件', isPrimary: true, material: { id: finished.id, code: finished.code, name: finished.name, stockUnit: finished.stockUnit, unit: finished.unit } },
          { id: `${bom.id}-out-by`, materialId: byproduct.id, quantity: 1, unit: 'kg', isPrimary: false, material: { id: byproduct.id, code: byproduct.code, name: byproduct.name, stockUnit: byproduct.stockUnit, unit: byproduct.unit } },
        ],
        items: [{
          id: `${bom.id}-raw`,
          quantity: 5,
          unit: raw.stockUnit,
          wastageRate: 0,
          material: {
            id: raw.id,
            code: raw.code,
            name: raw.name,
            stockUnit: raw.stockUnit,
            unit: raw.unit,
          },
        }],
      }],
    }]
    assert.deepEqual(dailyProductionInputMaterials(selectionMaterials).map((item) => item.id), [raw.id])
    assert.deepEqual(
      dailyProductionOutputMaterials(selectionMaterials).map((item) => item.id),
      [byproduct.id, finished.id],
      '可生产对象必须包含主产出和副产出，不能把复杂 BOM 简化成一对一',
    )
    assert.deepEqual(
      dailyProductionBomCandidates(selectionMaterials, { outputMaterialId: finished.id }).map((candidate) => [candidate.bom.id, candidate.outputMaterial.id, candidate.matchedOutputMaterial.id]),
      [[bom.id, finished.id, finished.id]],
      '选择主产出必须反查出对应正式 BOM',
    )
    assert.deepEqual(
      dailyProductionBomCandidates(selectionMaterials, { outputMaterialId: byproduct.id }).map((candidate) => [candidate.bom.id, candidate.outputMaterial.id, candidate.matchedOutputMaterial.id]),
      [[bom.id, finished.id, byproduct.id]],
      '选择副产出也必须反查出整个复杂 BOM，并保留主产出身份',
    )
    assert.deepEqual(
      dailyProductionBomCandidates(selectionMaterials, { inputMaterialId: raw.id }).map((candidate) => [candidate.bom.id, candidate.outputMaterial.id]),
      [[bom.id, finished.id]],
      '选择投入物料必须反查出对应正式 BOM 和主产出',
    )
    assert.deepEqual(
      dailyProductionBomCandidates(selectionMaterials, { outputMaterialId: finished.id, inputMaterialId: raw.id }).map((candidate) => candidate.bom.id),
      [bom.id],
      '同时选择产出和投入时必须取交集',
    )
    assert.deepEqual(
      dailyProductionBomCandidates(selectionMaterials, { outputMaterialId: finished.id, inputMaterialId: finished.id }),
      [],
      '不满足投入条件的 BOM 不得出现在双条件结果中',
    )
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
      bomId: bom.id,
      outputDisposition: 'DIRECT_AVAILABLE' as const,
      note: '快捷日报验证',
      consumptions: [{
        materialId: raw.id,
        locationId: inputLocation.id,
        lossMode: 'PERCENT' as const,
        lossValue: 0,
        actualQty: 10,
      }],
      outputs: [
        { materialId: finished.id, locationId: outputLocation.id, actualQty: 20, isPrimary: true },
        { materialId: byproduct.id, locationId: outputLocation.id, actualQty: 2, isPrimary: false },
      ],
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
    assert.equal(report.outputs.length, 2, '正式 BOM 快捷过账必须保存全部实际产出明细')
    const balances = await prisma.stockLocationBalance.findMany()
    const balanceByLocation = new Map<string, number>()
    for (const balance of balances) balanceByLocation.set(balance.locationId, Number(balanceByLocation.get(balance.locationId) || 0) + Number(balance.qty))
    assert.deepEqual(
      [balanceByLocation.get(inputLocation.id), balanceByLocation.get(outputLocation.id)],
      [10, 22],
      '必须按 BOM 原子扣减投入并增加产出',
    )
    assert.equal(await prisma.productionOrder.count(), 0, '快捷日报不得创建生产订单')
    assert.equal(await prisma.productionOrderActual.count(), 0, '快捷日报不得创建生产订单实绩')
    assert.equal(await prisma.qualityInspection.count(), 0, '直接入库模式不得创建质检任务')

    const qualityReport = await createAndConfirmDailyProductionShortcut(
      {
        ...commonInput,
        outputs: commonInput.outputs.map((line) => ({ ...line, actualQty: line.isPrimary ? 2 : 0.2 })),
        outputDisposition: 'QUALITY_INSPECTION',
        consumptions: [{ ...commonInput.consumptions[0], actualQty: 1 }],
      },
      unrestrictedDataScope,
      '验证管理员',
      { operatorName: '验证管理员' },
    )
    const qualityInspection = await prisma.qualityInspection.findFirst({
      where: { sourceType: 'PRODUCTION_ORDER_ACTUAL_OUTPUT', sourceId: qualityReport.outputs.find((line) => line.isPrimary)!.id },
      include: { lot: { include: { balances: true } } },
    })
    assert.ok(qualityInspection, '待检模式必须创建后续质量任务')
    assert.equal(qualityInspection.status, 'PENDING')
    assert.equal(qualityInspection.lot.sourceType, 'DAILY_PRODUCTION_REPORT_OUTPUT')
    assert.equal(qualityInspection.lot.balances[0]?.inventoryStatus, 'QUARANTINE')
    await decideQualityInspection(
      qualityInspection.id,
      {
        decision: 'PASS',
        sampleQty: 2,
        goodQty: 2,
        badQty: 0,
        note: '快捷日报后续质检通过',
      },
      '验证质检员',
      unrestrictedDataScope,
    )
    const completedInspection = await prisma.qualityInspection.findUniqueOrThrow({ where: { id: qualityInspection.id } })
    assert.deepEqual(
      [completedInspection.status, completedInspection.result, completedInspection.inspector],
      ['COMPLETED', 'PASS', '验证质检员'],
      '快捷日报创建的质量任务必须能够沿用统一质量判定流程',
    )

    const reverseableReport = await createAndConfirmDailyProductionShortcut(
      {
        ...commonInput,
        outputs: commonInput.outputs.map((line) => ({ ...line, actualQty: line.isPrimary ? 2 : 0.2 })),
        outputDisposition: 'QUALITY_INSPECTION',
        consumptions: [{ ...commonInput.consumptions[0], actualQty: 1 }],
      },
      unrestrictedDataScope,
      '验证管理员',
      { operatorName: '验证管理员' },
    )
    const reverseableInspection = await prisma.qualityInspection.findFirstOrThrow({
      where: { sourceType: 'PRODUCTION_ORDER_ACTUAL_OUTPUT', sourceId: reverseableReport.outputs.find((line) => line.isPrimary)!.id },
      include: { lot: true },
    })
    await reverseLegacyDailyProductionReport(
      reverseableReport.id,
      { reason: '验证待检日报冲销' },
      '验证管理员',
    )
    const [reversedReport, reversedInspection, reversedLot] = await Promise.all([
      prisma.dailyProductionReport.findUniqueOrThrow({ where: { id: reverseableReport.id } }),
      prisma.qualityInspection.findUniqueOrThrow({ where: { id: reverseableInspection.id } }),
      prisma.inventoryLot.findUniqueOrThrow({ where: { id: reverseableInspection.lotId } }),
    ])
    assert.equal(reversedReport.status, 'REVERSED', '待检日报必须允许在质量判定前完整冲销')
    assert.equal(reversedInspection.status, 'REVERSED', '待检日报冲销必须同步关闭质量任务')
    assert.equal(reversedLot.status, 'REVERSED', '待检日报冲销必须同步关闭产出批次')

    const heldReport = await createAndConfirmDailyProductionShortcut(
      {
        ...commonInput,
        outputs: commonInput.outputs.map((line) => ({ ...line, actualQty: line.isPrimary ? 2 : 0.2 })),
        outputDisposition: 'QUALITY_INSPECTION',
        consumptions: [{ ...commonInput.consumptions[0], actualQty: 1 }],
      },
      unrestrictedDataScope,
      '验证管理员',
      { operatorName: '验证管理员' },
    )
    const heldInspection = await prisma.qualityInspection.findFirstOrThrow({
      where: { sourceType: 'PRODUCTION_ORDER_ACTUAL_OUTPUT', sourceId: heldReport.outputs.find((line) => line.isPrimary)!.id },
    })
    await decideQualityInspection(
      heldInspection.id,
      {
        decision: 'FAIL',
        sampleQty: 2,
        goodQty: 0,
        badQty: 2,
        note: '验证整批冻结后日报冲销',
      },
      '验证质检员',
      unrestrictedDataScope,
    )
    await reverseLegacyDailyProductionReport(
      heldReport.id,
      { reason: '验证冻结日报冲销' },
      '验证管理员',
    )
    const reversedHeldInspection = await prisma.qualityInspection.findUniqueOrThrow({ where: { id: heldInspection.id } })
    assert.equal(reversedHeldInspection.status, 'REVERSED', '整批冻结但未发生后续处置时必须允许日报受控冲销')

    const finishedStock = await prisma.stock.findUniqueOrThrow({ where: { materialId: finished.id } })
    assert.deepEqual(
      [Number(finishedStock.qty), Number(finishedStock.availableQty), Number(finishedStock.quarantineQty), Number(finishedStock.holdQty)],
      [22, 22, 0, 0],
      '待检产出放行与待检日报冲销后必须保持库存状态和总量一致',
    )
    const rawStock = await prisma.stock.findUniqueOrThrow({ where: { materialId: raw.id } })
    assert.equal(Number(rawStock.qty), 9, '待检日报冲销必须恢复原料耗用')
    assert.equal(await prisma.auditLog.count({ where: { entityType: 'DAILY_PRODUCTION_REPORT', action: 'CONFIRM' } }), 4)
    const restrictedWorkspace = await listDailyProductionShortcutWorkspace({
      ...unrestrictedDataScope, inventoryMode: 'LOCATIONS', locationIds: [outputLocation.id],
    })
    assert.equal(restrictedWorkspace.reports.length, 0, '库位范围不完整时不得返回日报投入明细')
    const authorizedWorkspace = await listDailyProductionShortcutWorkspace({
      ...unrestrictedDataScope, inventoryMode: 'LOCATIONS', locationIds: [inputLocation.id, outputLocation.id],
    })
    assert.equal(authorizedWorkspace.reports.length, 4, '投入和产出库位均获授权时应返回日报')

    const temporaryReport = await createAndConfirmDailyProductionShortcut(
      {
        reportDate: '2026-08-23',
        outputDisposition: 'DIRECT_AVAILABLE',
        note: '无 BOM 临时转换',
        consumptions: [{ materialId: raw.id, locationId: inputLocation.id, lossMode: 'PERCENT', lossValue: 0, actualQty: 1 }],
        outputs: [{ materialId: finished.id, locationId: outputLocation.id, actualQty: 1, isPrimary: true }],
      },
      unrestrictedDataScope,
      '验证管理员',
      { operatorName: '验证管理员' },
    )
    assert.equal(temporaryReport.bomVersion, '无 BOM', '无 BOM 临时生产必须保存明确快照标识')
    assert.equal(temporaryReport.outputs.length, 1, '无 BOM 临时生产也必须保存实际产出明细')

    const reportsBeforeFailure = await prisma.dailyProductionReport.count()
    await assert.rejects(
      () => createAndConfirmDailyProductionShortcut(
        { ...commonInput, outputs: commonInput.outputs.map((line) => ({ ...line, actualQty: line.isPrimary ? 40 : 4 })), consumptions: [{ ...commonInput.consumptions[0], actualQty: 30 }] },
        unrestrictedDataScope,
        '验证管理员',
        { operatorName: '验证管理员' },
      ),
      /库存不足/,
    )
    assert.equal(await prisma.dailyProductionReport.count(), reportsBeforeFailure, '扣料失败时不得留下日报草稿')
    console.log('快捷生产/转换验证通过：BOM 可选预设、多投入多产出、无 BOM 临时生产、直接/待检入库、质量放行、冲销和失败回滚均符合预期')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
