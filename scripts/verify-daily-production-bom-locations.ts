import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-dp-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`

execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

function verifyStaticBoundaries() {
  const requiredFiles = [
    'modules/production/contracts/legacy-daily-production-schema.ts',
    'modules/production/domain/legacy-daily-production-errors.ts',
    'modules/production/domain/legacy-daily-production-rules.ts',
    'modules/production/http/legacy-daily-production-http.ts',
    'modules/production/server/legacy-daily-production-command-service.ts',
    'modules/production/server/legacy-daily-production-consumption.ts',
    'modules/production/server/legacy-daily-production-operation.ts',
    'modules/production/server/legacy-daily-production-query-service.ts',
    'modules/production/server/legacy-daily-production-status-service.ts',
  ]
  for (const path of requiredFiles) assert.ok(existsSync(join(root, path)), `生产领域缺少旧生产日报兼容模块：${path}`)
  for (const path of ['lib/daily-production.ts', 'lib/daily-production-request.ts']) {
    assert.equal(existsSync(join(root, path)), false, `旧生产日报业务辅助层应移入生产领域：${path}`)
  }

  const routePaths = [
    'app/api/daily-production-reports/route.ts',
    'app/api/daily-production-reports/[id]/route.ts',
    'app/api/daily-production-reports/[id]/confirm/route.ts',
    'app/api/daily-production-reports/[id]/reverse/route.ts',
  ]
  for (const routePath of routePaths) {
    const route = read(routePath)
    assert.ok(route.split('\n').length <= 65, `${routePath} 应保持为不超过 65 行的 HTTP 适配层`)
    assert.doesNotMatch(route, /@\/lib\/prisma|\bprisma\.|\$transaction\(/, `${routePath} 不得直接访问 Prisma 或持有事务`)
    assert.match(route, /@\/modules\/production\//, `${routePath} 必须委托生产领域服务`)
  }

  const services = [
    read('modules/production/server/legacy-daily-production-command-service.ts'),
    read('modules/production/server/legacy-daily-production-consumption.ts'),
    read('modules/production/server/legacy-daily-production-operation.ts'),
    read('modules/production/server/legacy-daily-production-query-service.ts'),
    read('modules/production/server/legacy-daily-production-status-service.ts'),
  ].join('\n')
  assert.doesNotMatch(
    services,
    /NextRequest|NextResponse|requireResourcePermission|writeAuditLog/,
    '生产日报领域服务不得依赖 HTTP、权限或请求审计',
  )
  assert.doesNotMatch(
    read('modules/production/domain/legacy-daily-production-errors.ts'),
    /@prisma\/client|NextRequest|NextResponse/,
    '旧日报领域错误必须保持为无数据库和 HTTP 依赖的纯领域类型',
  )
  assert.doesNotMatch(read('modules/production/http/legacy-daily-production-http.ts'), /@\/lib\/prisma|\bprisma\./)
}

async function main() {
  const [
    { prisma },
    { postInventoryReceipt },
    { createInventoryLotReceipt },
    { legacyDailyProductionReportInputSchema },
    { LegacyDailyProductionError },
    { buildLegacyDailyProductionReportNo, parseLegacyDailyProductionReportDate },
    { createLegacyDailyProductionReport, updateLegacyDailyProductionReport },
    { listLegacyDailyProductionWorkspace },
    { confirmLegacyDailyProductionReport, reverseLegacyDailyProductionReport },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/inventory'),
    import('../modules/inventory'),
    import('../modules/production/contracts/legacy-daily-production-schema'),
    import('../modules/production/domain/legacy-daily-production-errors'),
    import('../modules/production/domain/legacy-daily-production-rules'),
    import('../modules/production/server/legacy-daily-production-command-service'),
    import('../modules/production/server/legacy-daily-production-query-service'),
    import('../modules/production/server/legacy-daily-production-status-service'),
  ])

  try {
    verifyStaticBoundaries()
    assert.equal(legacyDailyProductionReportInputSchema.safeParse({}).success, false)
    assert.throws(() => parseLegacyDailyProductionReportDate('2026-02-30'), LegacyDailyProductionError)
    assert.equal(
      buildLegacyDailyProductionReportNo(new Date(2026, 7, 10), ['PR-20260810-001', 'PR-20260810-003']),
      'PR-20260810-004',
      '日报编号必须取当天最大流水号，不能因删除历史草稿而重复',
    )

    const [locationA, locationB, outputLocation] = await Promise.all([
      prisma.inventoryLocation.create({ data: { code: 'RAW-A', name: '原料库位 A' } }),
      prisma.inventoryLocation.create({ data: { code: 'RAW-B', name: '原料库位 B' } }),
      prisma.inventoryLocation.create({ data: { code: 'OUTPUT', name: '产出库位' } }),
    ])
    const [rawA, rawB, finished] = await Promise.all([
      prisma.material.create({ data: { code: 'RAW-A', name: '原料 A', category: 'RAW', unit: 'm', stockUnit: 'm', valuationUnit: 'm' } }),
      prisma.material.create({ data: { code: 'RAW-B', name: '原料 B', category: 'RAW', unit: '件', stockUnit: '件', valuationUnit: '件' } }),
      prisma.material.create({ data: { code: 'FIN', name: '验证产出', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件' } }),
    ])
    const employee = await prisma.employee.create({ data: { code: 'EMP-01', name: '验证员' } })
    const product = await prisma.product.create({
      data: { sku: finished.code, name: finished.name, category: 'FINISHED', unit: '件' },
    })
    const selectedBom = await prisma.bOM.create({
      data: {
        productId: product.id,
        name: '双原料方案',
        version: 'v2',
        outputQuantity: 10,
        outputUnit: '件',
        items: {
          create: [
            { materialId: rawA.id, quantity: 3, unit: 'm' },
            { materialId: rawB.id, quantity: 2, unit: '件' },
          ],
        },
      },
    })
    await prisma.bOM.update({
      where: { id: selectedBom.id },
      data: { status: 'RELEASED', isActive: true, isDefault: true, releasedAt: new Date() },
    })

    const sourceLots = await prisma.$transaction(async (tx) => {
      const rawAReceipt = await postInventoryReceipt(tx, {
        materialId: rawA.id, stockQty: 10, valuationQty: 10, costAmount: 100,
        type: 'VERIFY_IN', refType: 'VERIFY', refId: 'raw-a', note: '验证入库', locationId: locationA.id,
      })
      const rawBReceipt = await postInventoryReceipt(tx, {
        materialId: rawB.id, stockQty: 10, valuationQty: 10, costAmount: 50,
        type: 'VERIFY_IN', refType: 'VERIFY', refId: 'raw-b', note: '验证入库', locationId: locationB.id,
      })
      assert.ok(rawAReceipt.movement && rawBReceipt.movement)
      const rawAFirst = await createInventoryLotReceipt(tx, {
        lotNo: 'RAW-A-LOT-001', materialId: rawA.id, sourceType: 'VERIFY_LOT', sourceId: 'raw-a-1',
        receivedAt: new Date('2026-08-01T00:00:00.000Z'), locationId: locationA.id, inventoryStatus: 'AVAILABLE',
        stockQty: 2, valuationQty: 2, costAmount: 20, stockLogId: rawAReceipt.movement.id,
        idempotencyKey: 'VERIFY:RAW-A:LOT:001',
      })
      const rawASecond = await createInventoryLotReceipt(tx, {
        lotNo: 'RAW-A-LOT-002', materialId: rawA.id, sourceType: 'VERIFY_LOT', sourceId: 'raw-a-2',
        receivedAt: new Date('2026-08-02T00:00:00.000Z'), locationId: locationA.id, inventoryStatus: 'AVAILABLE',
        stockQty: 8, valuationQty: 8, costAmount: 80, stockLogId: rawAReceipt.movement.id,
        idempotencyKey: 'VERIFY:RAW-A:LOT:002',
      })
      const rawBFirst = await createInventoryLotReceipt(tx, {
        lotNo: 'RAW-B-LOT-001', materialId: rawB.id, sourceType: 'VERIFY_LOT', sourceId: 'raw-b-1',
        receivedAt: new Date('2026-08-01T00:00:00.000Z'), locationId: locationB.id, inventoryStatus: 'AVAILABLE',
        stockQty: 10, valuationQty: 10, costAmount: 50, stockLogId: rawBReceipt.movement.id,
        idempotencyKey: 'VERIFY:RAW-B:LOT:001',
      })
      return { rawAFirst, rawASecond, rawBFirst }
    })

    const input = {
      reportDate: '2026-08-10',
      finishedMaterialId: finished.id,
      bomId: selectedBom.id,
      consumptionLocationId: locationA.id,
      outputLocationId: outputLocation.id,
      outputQty: 20,
      employeeIds: [employee.id],
      note: '首版草稿',
      consumptions: [
        { materialId: rawA.id, locationId: locationA.id, lossMode: 'PERCENT' as const, lossValue: 0 },
        { materialId: rawB.id, locationId: locationB.id, lossMode: 'PERCENT' as const, lossValue: 0 },
      ],
    }
    assert.equal(legacyDailyProductionReportInputSchema.safeParse({
      ...input,
      consumptions: [input.consumptions[0], input.consumptions[0]],
    }).success, false, '同一原料不得重复填写')
    await assert.rejects(
      () => createLegacyDailyProductionReport(),
      (error: unknown) => error instanceof LegacyDailyProductionError && error.status === 410,
      '旧生产日报必须停止新建',
    )

    const created = await prisma.dailyProductionReport.create({
      data: {
        reportNo: 'PR-20260810-001',
        reportDate: new Date('2026-08-10T00:00:00.000Z'),
        finishedMaterialId: finished.id,
        consumptionLocationId: locationA.id,
        outputLocationId: outputLocation.id,
        outputQty: 20,
        workers: '验证员',
        note: '首版草稿',
        bomId: selectedBom.id,
        bomName: selectedBom.name,
        bomVersion: selectedBom.version,
        bomType: 'PRODUCTION',
        bomOutputQuantity: selectedBom.outputQuantity,
        bomOutputUnit: selectedBom.outputUnit,
      },
    })
    await assert.rejects(
      () => updateLegacyDailyProductionReport(created.id, { ...input, outputQty: 100 }),
      /库存不足/,
      '历史草稿更新时仍应拒绝超过来源库位可用量的耗用',
    )

    const updated = await updateLegacyDailyProductionReport(created.id, { ...input, note: '已更新草稿' })
    assert.deepEqual([updated.existing.note, updated.report.note], ['首版草稿', '已更新草稿'])
    assert.deepEqual(updated.report.consumptions.map((line) => [line.materialCode, line.actualQty, line.locationId]), [
      [rawA.code, 6, locationA.id],
      [rawB.code, 4, locationB.id],
    ])
    const workspace = await listLegacyDailyProductionWorkspace({ keyword: '验证员 验证产出', status: 'DRAFT' })
    assert.deepEqual(workspace.reports.map((report) => report.id), [created.id], '多关键词应跨人员和产出物料字段组合查询')
    assert.equal(workspace.materials.find((material) => material.id === finished.id)?.bom?.id, selectedBom.id)

    const confirmedAt = new Date('2026-08-10T08:00:00.000Z')
    const confirmed = await confirmLegacyDailyProductionReport(created.id, '验证主管', confirmedAt)
    assert.deepEqual(
      [confirmed.result.status, confirmed.result.confirmedBy, confirmed.result.confirmedAt?.toISOString()],
      ['CONFIRMED', '验证主管', confirmedAt.toISOString()],
    )
    assert.ok(Number(confirmed.result.outputCostAmount) > 0, '确认生产必须将实际耗用成本结转到产出')
    await assert.rejects(() => confirmLegacyDailyProductionReport(created.id, '验证主管'), /只有草稿生产记录可以确认/)
    await assert.rejects(() => updateLegacyDailyProductionReport(created.id, input), /只有草稿生产记录可以修改/)

    const qtyAt = async (materialId: string, locationId: string) => Number((await prisma.stockLocationBalance.findFirst({
      where: { stock: { materialId }, locationId },
    }))?.qty || 0)
    assert.deepEqual(
      [await qtyAt(rawA.id, locationA.id), await qtyAt(rawB.id, locationB.id), await qtyAt(finished.id, outputLocation.id)],
      [4, 6, 20],
      '确认生产必须在逐项来源库位扣料并在产出库位入库',
    )
    const confirmedConsumptions = confirmed.result.consumptions
    for (const line of confirmedConsumptions) {
      const transactions = await prisma.inventoryLotTransaction.findMany({
        where: { refType: 'DAILY_PRODUCTION_CONSUMPTION', refId: line.id, type: 'PRODUCTION_CONSUME' },
      })
      assert.ok(transactions.length > 0, '生产日报确认必须记录投入批次流水')
      assert.equal(transactions.every((transaction) => Boolean(transaction.stockLogId)), true, '批次耗用必须关联正式库存流水')
      assert.equal(Number((-transactions.reduce((sum, transaction) => sum + Number(transaction.stockQty), 0)).toFixed(6)), Number(line.actualQty))
      assert.equal(Number((-transactions.reduce((sum, transaction) => sum + Number(transaction.valuationQty), 0)).toFixed(6)), Number(line.valuationQty))
      assert.equal(Number((-transactions.reduce((sum, transaction) => sum + Number(transaction.costAmount), 0)).toFixed(6)), Number(line.costAmount))
    }
    assert.deepEqual(
      (await prisma.inventoryLotTransaction.findMany({
        where: { refType: 'DAILY_PRODUCTION_CONSUMPTION', refId: confirmedConsumptions.find((line) => line.materialId === rawA.id)?.id },
        include: { lot: true }, orderBy: { createdAt: 'asc' },
      })).map((transaction) => [transaction.lot.lotNo, Number(transaction.stockQty)]),
      [['RAW-A-LOT-001', -2], ['RAW-A-LOT-002', -4]],
      '生产日报投入应按批次收料时间 FIFO 扣减',
    )
    const balanceQty = async (lotId: string) => Number((await prisma.inventoryLotBalance.findUniqueOrThrow({
      where: { lotId_locationId_inventoryStatus: { lotId, locationId: lotId === sourceLots.rawBFirst.id ? locationB.id : locationA.id, inventoryStatus: 'AVAILABLE' } },
    })).stockQty)
    assert.deepEqual(
      [await balanceQty(sourceLots.rawAFirst.id), await balanceQty(sourceLots.rawASecond.id), await balanceQty(sourceLots.rawBFirst.id)],
      [0, 4, 6],
      '确认后批次余额必须与 FIFO 耗用一致',
    )
    const unrelatedOlderLot = await prisma.inventoryLot.create({
      data: {
        lotNo: 'RAW-A-OLDER-ZERO', materialId: rawA.id, sourceType: 'VERIFY_LOT', sourceId: 'raw-a-older-zero',
        receivedAt: new Date('2020-01-01T00:00:00.000Z'),
        balances: { create: { locationId: locationA.id, inventoryStatus: 'AVAILABLE', stockQty: 0, valuationQty: 0, costAmount: 0 } },
      },
    })

    const reversedAt = new Date('2026-08-10T09:00:00.000Z')
    const reversed = await reverseLegacyDailyProductionReport(
      created.id,
      { reason: '验证冲销' },
      '验证主管',
      reversedAt,
    )
    assert.deepEqual(
      [reversed.result.status, reversed.result.reversedBy, reversed.result.reversedAt?.toISOString()],
      ['REVERSED', '验证主管', reversedAt.toISOString()],
    )
    assert.deepEqual(
      [await qtyAt(rawA.id, locationA.id), await qtyAt(rawB.id, locationB.id), await qtyAt(finished.id, outputLocation.id)],
      [10, 10, 0],
      '冲销生产必须恢复原料来源库位并撤销产出库位库存',
    )
    assert.deepEqual(
      [await balanceQty(sourceLots.rawAFirst.id), await balanceQty(sourceLots.rawASecond.id), await balanceQty(sourceLots.rawBFirst.id), await balanceQty(unrelatedOlderLot.id)],
      [2, 8, 10, 0],
      '冲销必须精确恢复原耗用批次，不得按当前 FIFO 改写其他批次',
    )
    const restoredLotTransactions = await prisma.inventoryLotTransaction.findMany({
      where: { refType: 'DAILY_PRODUCTION_CONSUMPTION_REVERSE', type: 'PRODUCTION_REVERSE_CONSUME' },
    })
    assert.equal(restoredLotTransactions.length, 3, '每条原批次耗用都必须对应一条批次恢复流水')
    assert.equal(restoredLotTransactions.every((transaction) => Boolean(transaction.stockLogId)), true, '批次恢复必须关联正式冲销流水')
    const dailyReversalLogs = await prisma.stockLog.findMany({ where: { refType: 'DAILY_PRODUCTION_REPORT_REVERSE', refId: created.id } })
    assert.equal(dailyReversalLogs.every((log) => Boolean(log.sourceMovementId)), true, '历史生产冲销流水必须全部指向原流水')
    assert.equal(await prisma.stockLog.count({ where: { reversalMovementId: { in: dailyReversalLogs.map((log) => log.id) } } }), dailyReversalLogs.length)
    await assert.rejects(
      () => reverseLegacyDailyProductionReport(created.id, { reason: '重复冲销' }, '验证主管'),
      /只有已确认生产记录可以冲销/,
    )

    const missingLotReport = await prisma.dailyProductionReport.create({
      data: {
        reportNo: 'PR-20260810-002', reportDate: new Date('2026-08-10T00:00:00.000Z'),
        finishedMaterialId: finished.id, consumptionLocationId: locationA.id, outputLocationId: outputLocation.id,
        outputQty: 20, workers: '验证员', note: '批次缺失回滚验证', bomId: selectedBom.id,
        bomName: selectedBom.name, bomVersion: selectedBom.version, bomType: 'PRODUCTION',
        bomOutputQuantity: selectedBom.outputQuantity, bomOutputUnit: selectedBom.outputUnit,
      },
    })
    await updateLegacyDailyProductionReport(missingLotReport.id, { ...input, note: '批次缺失回滚验证' })
    const missingLotConfirmed = await confirmLegacyDailyProductionReport(missingLotReport.id, '验证主管')
    const missingLine = missingLotConfirmed.result.consumptions[0]
    await prisma.inventoryLotTransaction.deleteMany({
      where: { refType: 'DAILY_PRODUCTION_CONSUMPTION', refId: missingLine.id, type: 'PRODUCTION_CONSUME' },
    })
    const snapshot = async () => ({
      status: (await prisma.dailyProductionReport.findUniqueOrThrow({ where: { id: missingLotReport.id } })).status,
      stocks: await prisma.stock.findMany({ orderBy: { materialId: 'asc' }, select: { materialId: true, qty: true, availableQty: true, valuationQty: true, totalCost: true } }),
      locations: await prisma.stockLocationBalance.findMany({ orderBy: { id: 'asc' }, select: { id: true, qty: true, availableQty: true } }),
      lots: await prisma.inventoryLotBalance.findMany({ orderBy: { id: 'asc' }, select: { id: true, stockQty: true, valuationQty: true, costAmount: true } }),
      costLayers: await prisma.inventoryCostLayer.findMany({ orderBy: { id: 'asc' }, select: { id: true, remainingStockQty: true, remainingValuationQty: true, remainingAmount: true, status: true } }),
      stockLogCount: await prisma.stockLog.count(),
      lotTransactionCount: await prisma.inventoryLotTransaction.count(),
    })
    const beforeRejectedReverse = await snapshot()
    await assert.rejects(
      () => reverseLegacyDailyProductionReport(missingLotReport.id, { reason: '原批次丢失' }, '验证主管'),
      /原耗用批次事务缺失/,
      '原批次事务缺失时必须拒绝冲销',
    )
    assert.deepEqual(await snapshot(), beforeRejectedReverse, '冲销被批次完整性阻断时，所有正式账本及批次余额都必须回滚')

    console.log('旧生产日报兼容模块验证通过：确认按 FIFO 扣减投入批次，冲销精确恢复原批次，依据缺失时整笔回滚')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
