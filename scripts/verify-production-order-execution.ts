import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  legacyProductionOrderPickSchema,
  legacyProductionOrderReportSchema,
  legacyProductionOrderStockInSchema,
} from '../modules/production/contracts/legacy-production-order-execution-schema'
import {
  areAllProductionStepsReported,
  incompletePreviousStepError,
  legacyOrderStatusAfterReport,
  legacyProductionCompatibilityError,
  legacyPickStatusError,
  legacyReportStatusError,
  legacyStockInStatusError,
  previousProductionStep,
} from '../modules/production/domain/legacy-production-order-execution-rules'

const root = process.cwd()
for (const path of [
  'app/api/orders/[id]/pick/route.ts',
  'app/api/orders/[id]/reports/route.ts',
  'app/api/orders/[id]/stock-in/route.ts',
]) {
  const source = readFileSync(join(root, path), 'utf8')
  assert.doesNotMatch(source, /@\/lib\/prisma|\bprisma\.|\$transaction|consumeMaterialCost|changeStockLocationBalance/, `${path} 不得保留数据库、成本或库存事务`)
  assert.ok(source.split('\n').length <= 40, `${path} 必须保持为不超过 40 行的 HTTP 适配层`)
}

const productionPage = readFileSync(join(root, 'modules/production/ui/ProductionOrderModule.tsx'), 'utf8')
const actualPanel = readFileSync(join(root, 'modules/production/ui/ProductionOrderActualPanel.tsx'), 'utf8')
assert.doesNotMatch(productionPage + actualPanel, /\/api\/orders\/[^'"`]+\/(pick|reports|stock-in)/, '当前生产页面不得重新调用旧领料、报工或入库兼容接口')

assert.equal(legacyProductionOrderPickSchema.safeParse({ items: [] }).success, false, '兼容领料至少包含一项明细')
assert.equal(legacyProductionOrderReportSchema.safeParse({ stepId: 's', workerName: '操作员', goodQty: 1, badQty: 0 }).success, true)
assert.equal(legacyProductionOrderStockInSchema.safeParse({ qty: 0, inBy: '仓管员' }).success, false, '兼容入库数量必须大于零')
assert.equal(legacyPickStatusError('CONFIRMED'), null)
assert.match(legacyPickStatusError('PICKED') || '', /不可领料/)
assert.equal(legacyReportStatusError('PICKED'), null)
assert.match(legacyReportStatusError('QC_DONE') || '', /不可报工/)
assert.equal(legacyStockInStatusError('QC_DONE'), null)
assert.match(legacyStockInStatusError('RUNNING') || '', /不可入库/)
assert.equal(legacyProductionCompatibilityError(null), null, '旧工单可继续完成兼容流程')
assert.match(legacyProductionCompatibilityError('material-id') || '', /生产实绩流程/, '新物料工单必须退出旧执行流程')

const ruleSteps = [
  { id: 'second', name: '精加工', stepNo: 20 },
  { id: 'first', name: '粗加工', stepNo: 10 },
]
assert.equal(previousProductionStep(ruleSteps, 'second')?.id, 'first', '上一工序必须按排序位置判断，不能假设工序号连续')
assert.match(incompletePreviousStepError(ruleSteps, [], 'second') || '', /粗加工/)
assert.equal(incompletePreviousStepError(ruleSteps, [{ stepId: 'first', endTime: new Date() }], 'second'), null)
assert.equal(areAllProductionStepsReported(ruleSteps, [{ stepId: 'first', endTime: new Date() }, { stepId: 'second', endTime: new Date() }]), true)
assert.equal(legacyOrderStatusAfterReport('PICKED', false), 'RUNNING')
assert.equal(legacyOrderStatusAfterReport('RUNNING', true), 'QC_WAITING')

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-production-execution-'))
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
    { pickLegacyProductionOrder },
    { listLegacyProductionOrderReports, reportLegacyProductionOrder },
    { stockInLegacyProductionOrder },
    { ProductionOrderDomainError },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/production/server/legacy-production-order-pick-service'),
    import('../modules/production/server/legacy-production-order-report-service'),
    import('../modules/production/server/legacy-production-order-stock-in-service'),
    import('../modules/production/domain/production-order-errors'),
  ])

  try {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const auditContext = {
      operatorId: 'verify-legacy-execution', operatorName: '兼容执行审计验证员',
      ipAddress: undefined, userAgent: undefined,
    }
    const location = await prisma.inventoryLocation.create({
      data: { code: `EXEC-${suffix}`, name: '兼容流程默认库位', isDefault: true },
    })
    const [inputMaterial, outputMaterial] = await Promise.all([
      prisma.material.create({ data: { code: `EXEC-IN-${suffix}`, name: '兼容流程投入', category: 'RAW', unit: '件', stockUnit: '件', valuationUnit: '件', conversionRate: 1 } }),
      prisma.material.create({ data: { code: `EXEC-OUT-${suffix}`, name: '兼容流程产出', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件', conversionRate: 1 } }),
    ])
    const product = await prisma.product.create({
      data: { sku: `MAT-${outputMaterial.code}`, name: outputMaterial.name, category: outputMaterial.category, unit: '件' },
    })
    const order = await prisma.productionOrder.create({
      data: {
        orderNo: `EXEC-WO-${suffix}`,
        productId: product.id,
        planQty: 5,
        status: 'CONFIRMED',
      },
    })
    const stock = await prisma.stock.create({
      data: {
        materialId: inputMaterial.id,
        qty: 20,
        reservedQty: 5,
        availableQty: 15,
        valuationQty: 20,
        reservedValuationQty: 5,
        availableValuationQty: 15,
        totalCost: 40,
        valuationUnitCost: 2,
        stockUnitCost: 2,
        locationBalances: { create: { locationId: location.id, qty: 20, reservedQty: 5, availableQty: 15 } },
      },
    })
    const pick = await prisma.pickItem.create({
      data: { orderId: order.id, materialId: inputMaterial.id, requiredQty: 5, reservedValuationQty: 5, status: 'RESERVED' },
    })

    await pickLegacyProductionOrder(order.id, { items: [{ pickItemId: pick.id, actualQty: 4, pickedBy: '验证领料员' }] }, '登录验证员')
    const [pickedOrder, pickedItem, pickedStock, pickedBalance, pickLogs] = await Promise.all([
      prisma.productionOrder.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.pickItem.findUniqueOrThrow({ where: { id: pick.id } }),
      prisma.stock.findUniqueOrThrow({ where: { id: stock.id } }),
      prisma.stockLocationBalance.findUniqueOrThrow({ where: { stockId_locationId: { stockId: stock.id, locationId: location.id } } }),
      prisma.stockLog.findMany({ where: { refType: 'PICK', refId: pick.id } }),
    ])
    assert.equal(pickedOrder.status, 'PICKED', '全部兼容领料完成后工单必须进入已领料')
    assert.deepEqual([pickedItem.status, pickedItem.actualQty, pickedItem.costAmount], ['COMPLETED', 4, 8])
    assert.deepEqual([pickedStock.qty, pickedStock.reservedQty, pickedStock.availableQty, pickedStock.totalCost], [16, 0, 16, 32])
    assert.deepEqual([pickedBalance.qty, pickedBalance.reservedQty, pickedBalance.availableQty], [16, 0, 16])
    assert.equal(pickLogs.length, 1, '兼容领料必须生成库存流水')
    assert.equal(pickLogs[0].createdBy, '登录验证员', '兼容领料库存流水必须使用服务端可信操作人')

    const route = await prisma.processRoute.create({
      data: {
        productId: product.id,
        name: '兼容流程路线',
        isDefault: true,
        steps: { create: [
          { stepNo: 10, name: '粗加工' },
          { stepNo: 20, name: '精加工' },
        ] },
      },
      include: { steps: { orderBy: { stepNo: 'asc' } } },
    })
    const reportInput = { workerName: '验证操作员', goodQty: 3, badQty: 0 }
    await assert.rejects(
      () => reportLegacyProductionOrder(order.id, { ...reportInput, stepId: route.steps[1].id }),
      (error: unknown) => error instanceof ProductionOrderDomainError && error.message.includes('粗加工'),
      '上一工序未完成时必须阻止跨序报工',
    )
    await reportLegacyProductionOrder(order.id, { ...reportInput, stepId: route.steps[0].id }, undefined, auditContext)
    assert.equal((await prisma.productionOrder.findUniqueOrThrow({ where: { id: order.id } })).status, 'RUNNING')
    const finalReport = await reportLegacyProductionOrder(order.id, { ...reportInput, stepId: route.steps[1].id }, undefined, auditContext)
    assert.deepEqual([finalReport.allStepsDone, finalReport.nextStatus], [true, 'QC_WAITING'])
    assert.equal((await listLegacyProductionOrderReports(order.id)).length, 2, '兼容报工查询必须返回完整工序记录')

    await prisma.productionOrder.update({ where: { id: order.id }, data: { status: 'QC_DONE' } })
    const stocked = await stockInLegacyProductionOrder(
      order.id,
      { qty: 3, batchNo: 'BATCH-001', inBy: '验证仓管员' },
      '登录验证员',
      auditContext,
    )
    const [outputStock, outputBalance, stockInLogs] = await Promise.all([
      prisma.stock.findUniqueOrThrow({ where: { productId: product.id } }),
      prisma.stockLocationBalance.findFirstOrThrow({ where: { stock: { productId: product.id } } }),
      prisma.stockLog.findMany({ where: { refType: 'STOCK_IN', refId: order.id } }),
    ])
    assert.deepEqual([stocked.updated.status, stocked.updated.completeQty], ['COMPLETED', 3])
    assert.deepEqual([outputStock.qty, outputStock.availableQty, outputStock.valuationQty], [3, 3, 0])
    assert.deepEqual([outputBalance.qty, outputBalance.availableQty], [3, 3])
    assert.equal(stockInLogs.length, 1, '首次创建库存余额时也必须生成兼容入库流水')
    assert.equal(stockInLogs[0].createdBy, '登录验证员', '兼容入库库存流水必须使用服务端可信操作人')
    const auditLogs = await prisma.auditLog.findMany({
      where: { operatorId: auditContext.operatorId }, orderBy: { createdAt: 'asc' },
    })
    assert.deepEqual(
      auditLogs.map((log) => `${log.entityType}:${log.action}`),
      ['WORK_REPORT:CREATE', 'WORK_REPORT:CREATE', 'STOCK_IN:CREATE'],
    )
    assert.equal(auditLogs.every((log) => Boolean(log.afterData)), true, '兼容报工与入库审计必须保留结果快照')
    await assert.rejects(
      () => stockInLegacyProductionOrder(order.id, { qty: 1, inBy: '重复入库员' }, '登录验证员'),
      ProductionOrderDomainError,
      '已完成工单不得重复兼容入库',
    )

    const modernOrder = await prisma.productionOrder.create({
      data: {
        orderNo: `MODERN-WO-${suffix}`,
        productId: product.id,
        materialId: outputMaterial.id,
        planQty: 5,
        status: 'CONFIRMED',
      },
    })
    const modernPick = await prisma.pickItem.create({
      data: { orderId: modernOrder.id, materialId: inputMaterial.id, requiredQty: 1, status: 'RESERVED' },
    })
    const isGone = (error: unknown) => (
      error instanceof ProductionOrderDomainError
      && error.status === 410
      && error.message.includes('生产实绩流程')
    )
    await assert.rejects(
      () => pickLegacyProductionOrder(modernOrder.id, { items: [{ pickItemId: modernPick.id, actualQty: 1, pickedBy: '验证员' }] }, '登录验证员'),
      isGone,
      '新物料工单不得写入旧领料流程',
    )
    await prisma.productionOrder.update({ where: { id: modernOrder.id }, data: { status: 'PICKED' } })
    await assert.rejects(
      () => reportLegacyProductionOrder(modernOrder.id, { ...reportInput, stepId: route.steps[0].id }),
      isGone,
      '新物料工单不得写入旧工序报工',
    )
    await prisma.productionOrder.update({ where: { id: modernOrder.id }, data: { status: 'QC_DONE' } })
    await assert.rejects(
      () => stockInLegacyProductionOrder(modernOrder.id, { qty: 1, inBy: '验证员' }, '登录验证员'),
      isGone,
      '新物料工单不得写入旧工单入库',
    )
    assert.equal(await prisma.workReport.count({ where: { orderId: modernOrder.id } }), 0)
    assert.equal(await prisma.stockIn.count({ where: { orderId: modernOrder.id } }), 0)

    console.log('生产订单旧执行兼容验证通过：历史工单可收尾，新物料工单禁止新增旧领料、报工和入库记录')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
