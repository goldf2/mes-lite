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
    { legacyDailyProductionReportInputSchema },
    { LegacyDailyProductionError },
    { buildLegacyDailyProductionReportNo, parseLegacyDailyProductionReportDate },
    { createLegacyDailyProductionReport, updateLegacyDailyProductionReport },
    { listLegacyDailyProductionWorkspace },
    { confirmLegacyDailyProductionReport, reverseLegacyDailyProductionReport },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/inventory'),
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
        isDefault: true,
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

    await prisma.$transaction(async (tx) => {
      await postInventoryReceipt(tx, {
        materialId: rawA.id, stockQty: 10, valuationQty: 10, costAmount: 100,
        type: 'VERIFY_IN', refType: 'VERIFY', refId: 'raw-a', note: '验证入库', locationId: locationA.id,
      })
      await postInventoryReceipt(tx, {
        materialId: rawB.id, stockQty: 10, valuationQty: 10, costAmount: 50,
        type: 'VERIFY_IN', refType: 'VERIFY', refId: 'raw-b', note: '验证入库', locationId: locationB.id,
      })
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
      () => createLegacyDailyProductionReport({ ...input, outputQty: 100 }),
      /库存不足/,
      '创建草稿时应拒绝超过来源库位可用量的耗用',
    )

    const created = await createLegacyDailyProductionReport(input)
    assert.deepEqual(
      [created.reportNo, created.status, created.bomId, created.workers],
      ['PR-20260810-001', 'DRAFT', selectedBom.id, '验证员'],
    )
    assert.deepEqual(created.consumptions.map((line) => [line.materialCode, line.actualQty, line.locationId]), [
      [rawA.code, 6, locationA.id],
      [rawB.code, 4, locationB.id],
    ])

    const updated = await updateLegacyDailyProductionReport(created.id, { ...input, note: '已更新草稿' })
    assert.deepEqual([updated.existing.note, updated.report.note], ['首版草稿', '已更新草稿'])
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

    const reversedAt = new Date('2026-08-10T09:00:00.000Z')
    const reversed = await reverseLegacyDailyProductionReport(
      created.id,
      { reason: '验证冲销', reversedBy: '验证主管' },
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
    await assert.rejects(
      () => reverseLegacyDailyProductionReport(created.id, { reason: '重复冲销', reversedBy: '验证主管' }),
      /只有已确认生产记录可以冲销/,
    )

    console.log('旧生产日报兼容模块验证通过：薄 API、输入规则、BOM 快照、搜索、确认过账和冲销闭环均符合预期')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
