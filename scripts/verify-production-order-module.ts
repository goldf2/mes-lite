import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cancelProductionOrderSchema, createProductionOrderSchema } from '../modules/production/contracts/production-order-schema'
import { createProductionOrderActualSchema } from '../modules/production/contracts/production-order-actual-schema'
import { parseProductionActualCostLayerSnapshot } from '../modules/production/domain/production-order-actual-cost-snapshot'
import { buildProductionActualNo, parseProductionActualDate, parseProductionActualSequence, productionActualDayRange } from '../modules/production/domain/production-order-actual-numbering'
import { parseProductionOrderBomSnapshot } from '../modules/production/domain/production-order-bom-snapshot'
import { ProductionOrderDomainError } from '../modules/production/domain/production-order-errors'
import { buildProductionOrderGroupNo, buildProductionOrderNo } from '../modules/production/domain/production-order-numbering'
import {
  expandProductionOrderStatusFilters,
  normalizeProductionOrderStatus,
  productionOrderActualCreationError,
  productionOrderCancellationError,
  productionOrderConfirmationError,
  productionOrderDispatchError,
  productionOrderReleaseError,
  productionOrderStatusAfterActual,
  releasedProductionOrderStatus,
} from '../modules/production/domain/production-order-status'
import { buildProductionOrderCreateInput, groupProductionOrders } from '../modules/production/model/production-order-view'

const root = process.cwd()
const requiredFiles = [
  'modules/production/client/production-order-api.ts',
  'modules/production/contracts/production-order.ts',
  'modules/production/contracts/production-order-schema.ts',
  'modules/production/contracts/production-order-actual-schema.ts',
  'modules/production/contracts/legacy-production-order-execution-schema.ts',
  'modules/production/domain/legacy-production-order-execution-rules.ts',
  'modules/production/domain/production-order-actual-cost-snapshot.ts',
  'modules/production/domain/production-order-actual-numbering.ts',
  'modules/production/domain/production-order-bom-snapshot.ts',
  'modules/production/domain/production-order-numbering.ts',
  'modules/production/domain/production-order-status.ts',
  'modules/production/model/production-order-view.ts',
  'modules/production/server/production-order-command-service.ts',
  'modules/production/server/production-order-query-service.ts',
  'modules/production/server/production-order-status-service.ts',
  'modules/production/server/production-order-actual-lines.ts',
  'modules/production/server/production-order-actual-service.ts',
  'modules/production/server/production-order-actual-status-service.ts',
  'modules/production/server/production-order-actual-totals.ts',
  'modules/production/server/legacy-production-order-pick-service.ts',
  'modules/production/server/legacy-production-order-report-service.ts',
  'modules/production/server/legacy-production-order-stock-in-service.ts',
  'modules/production/ui/ProductionOrderModule.tsx',
]
for (const path of requiredFiles) assert.ok(existsSync(join(root, path)), `生产订单模块缺少文件：${path}`)
assert.equal(existsSync(join(root, 'lib/production-order-actual.ts')), false, '生产实绩规则不得继续留在扁平 lib 目录')

const pageSource = readFileSync(join(root, 'modules/production/ui/ProductionOrderModule.tsx'), 'utf8')
const clientSource = readFileSync(join(root, 'modules/production/client/production-order-api.ts'), 'utf8')
const indexSource = readFileSync(join(root, 'modules/production/index.ts'), 'utf8')
const routeSource = readFileSync(join(root, 'app/api/orders/route.ts'), 'utf8')
const commandSource = readFileSync(join(root, 'modules/production/server/production-order-command-service.ts'), 'utf8')
const querySource = readFileSync(join(root, 'modules/production/server/production-order-query-service.ts'), 'utf8')
const statusSource = readFileSync(join(root, 'modules/production/server/production-order-status-service.ts'), 'utf8')
const actualServiceSource = readFileSync(join(root, 'modules/production/server/production-order-actual-service.ts'), 'utf8')
const actualStatusSource = readFileSync(join(root, 'modules/production/server/production-order-actual-status-service.ts'), 'utf8')
assert.ok(pageSource.split('\n').length <= 480, '生产订单协调页应保持在 480 行内')
assert.doesNotMatch(pageSource, /\bfetch\(/, '生产订单页面不得直接调用 fetch')
assert.match(pageSource, /loadProductionOrders\(/, '生产订单页面必须通过领域 client 读取列表')
assert.match(pageSource, /createProductionOrders\(/, '生产订单页面必须通过领域 client 创建订单')
assert.match(clientSource, /\/api\/orders\/options/, '生产订单 client 必须集中候选项接口')
assert.match(clientSource, /\/api\/orders\/\$\{encodeURIComponent\(orderId\)\}/, '生产订单 client 必须集中详情接口')
assert.match(clientSource, /export async function releaseProductionOrder[\s\S]*\/confirm/, '生产订单 client 必须提供发布命令')
assert.match(pageSource, /releaseProductionOrder[\s\S]*发布生产订单/, '草稿订单详情必须提供显式发布动作')
assert.match(
  pageSource,
  /ProductionOrderActualPanel[\s\S]*key=\{`\$\{orderDetail\.id\}:\$\{orderDetail\.status\}`\}/,
  '订单状态变化后必须重载生产实绩工作区，避免发布后按钮继续沿用草稿状态',
)
assert.match(indexSource, /ProductionOrderMode.*contracts\/production-order/, '生产订单模式类型必须从领域契约公开')
assert.match(routeSource, /production-order-command-service/, '生产订单 API 必须委托命令服务')
assert.match(routeSource, /production-order-query-service/, '生产订单 API 必须委托查询服务')
assert.doesNotMatch(routeSource, /@\/lib\/prisma|\bprisma\.|\$transaction|ensureProductForMaterial|tokenizeKeywordQuery/, '生产订单 API 不得保留数据库、事务或查询规则')
assert.ok(routeSource.split('\n').length <= 100, '生产订单 API 必须保持为不超过 100 行的 HTTP 适配层')
assert.match(commandSource, /\$transaction/, '生产订单命令服务必须拥有创建事务')
assert.match(commandSource, /ensureProductForMaterial/, '生产订单命令服务必须拥有物料兼容映射')
assert.match(commandSource, /outputs\.filter[\s\S]*isPrimary/, '生产订单命令服务必须校验唯一主产出')
assert.doesNotMatch(commandSource, /NextRequest|NextResponse|writeAuditLog|requireResourcePermission/, '生产订单命令服务不得依赖 HTTP、权限或请求审计')
assert.match(querySource, /tokenizeKeywordQuery/, '生产订单查询服务必须保留空格分隔多关键词查询')
assert.doesNotMatch(querySource, /NextRequest|NextResponse|requireResourcePermission/, '生产订单查询服务不得依赖 HTTP 或权限入口')
for (const path of [
  'app/api/orders/[id]/route.ts',
  'app/api/orders/options/route.ts',
  'app/api/orders/[id]/confirm/route.ts',
  'app/api/orders/[id]/cancel/route.ts',
]) {
  const source = readFileSync(join(root, path), 'utf8')
  assert.doesNotMatch(source, /@\/lib\/prisma|\bprisma\.|\$transaction|changeStockLocationBalance|restoreMaterialCost/, `${path} 不得保留数据库或状态事务规则`)
  assert.ok(source.split('\n').length <= 45, `${path} 必须保持为不超过 45 行的 HTTP 适配层`)
}
assert.match(
  readFileSync(join(root, 'app/api/orders/[id]/confirm/route.ts'), 'utf8'),
  /writeAuditLog[\s\S]*action:\s*'RELEASE'/,
  '生产订单发布必须记录前后状态审计',
)
for (const path of [
  'app/api/orders/[id]/pick/route.ts',
  'app/api/orders/[id]/reports/route.ts',
  'app/api/orders/[id]/stock-in/route.ts',
]) {
  const source = readFileSync(join(root, path), 'utf8')
  assert.doesNotMatch(source, /@\/lib\/prisma|\bprisma\.|\$transaction|consumeMaterialCost|changeStockLocationBalance/, `${path} 不得保留旧执行数据库、成本或库存事务`)
  assert.ok(source.split('\n').length <= 40, `${path} 必须保持为不超过 40 行的 HTTP 兼容层`)
}
assert.match(querySource, /getProductionOrderDetail[\s\S]*currentStepId/, '生产订单查询服务必须装配详情与当前工序')
assert.match(querySource, /listProductionOrderOptions[\s\S]*byMaterial/, '生产订单查询服务必须集中 BOM 候选项归组')
assert.match(statusSource, /\$transaction/, '生产订单取消必须由状态服务拥有事务边界')
assert.match(statusSource, /restoreMaterialCost[\s\S]*changeStockLocationBalance/, '取消已领料订单必须恢复成本与库位余额')
assert.doesNotMatch(statusSource, /NextRequest|NextResponse|requireResourcePermission|writeAuditLog/, '生产订单状态服务不得依赖 HTTP、权限或请求审计')

for (const path of [
  'app/api/orders/[id]/actuals/route.ts',
  'app/api/orders/[id]/actuals/[actualId]/route.ts',
  'app/api/orders/[id]/actuals/[actualId]/confirm/route.ts',
  'app/api/orders/[id]/actuals/[actualId]/reverse/route.ts',
]) {
  const source = readFileSync(join(root, path), 'utf8')
  assert.doesNotMatch(source, /@\/lib\/prisma|\bprisma\.|\$transaction|postInventoryIssue|postInventoryReceipt|changeStockLocationBalance/, `${path} 不得保留数据库、事务或库存过账规则`)
  assert.ok(source.split('\n').length <= 50, `${path} 必须保持为不超过 50 行的 HTTP 适配层`)
}
assert.match(actualServiceSource, /getProductionOrderActualWorkspace[\s\S]*createProductionOrderActual[\s\S]*deleteProductionOrderActualDraft/, '生产实绩服务必须集中查询、创建和草稿删除')
assert.match(actualServiceSource, /\$transaction/, '生产实绩创建必须由领域服务拥有事务边界')
assert.match(actualStatusSource, /confirmProductionOrderActual[\s\S]*reverseProductionOrderActual/, '生产实绩状态服务必须集中确认与冲销')
assert.match(actualStatusSource, /postInventoryIssue[\s\S]*postInventoryReceipt/, '生产实绩确认必须在状态服务完成投入与产出过账')
assert.match(actualStatusSource, /parseProductionActualCostLayerSnapshot[\s\S]*PRODUCTION_REVERSE_CONSUME/, '生产实绩冲销必须恢复历史成本层和投入库存')
assert.doesNotMatch(actualServiceSource + actualStatusSource, /NextRequest|NextResponse|requireResourcePermission|writeAuditLog/, '生产实绩服务不得依赖 HTTP、权限或请求审计')

assert.equal(createProductionOrderSchema.safeParse({ items: [] }).success, false, '生产订单必须包含至少一项物料')
assert.equal(createProductionOrderSchema.safeParse({ targetId: 'material', bomId: 'bom', planQty: 1 }).success, true, '旧单行请求契约必须继续兼容')
assert.equal(createProductionOrderSchema.safeParse({ items: Array.from({ length: 51 }, () => ({ targetId: 'material', bomId: 'bom', planQty: 1 })) }).success, false, '单张生产订单最多允许 50 项')
const fixedDate = new Date('2026-08-09T08:00:00.000Z')
assert.equal(buildProductionOrderGroupNo(fixedDate, 0), 'WO-20260809-001', '生产订单组号必须按日期和当日序号生成')
assert.equal(buildProductionOrderNo('WO-20260809-001', 0), 'WO-20260809-001', '第一行订单号必须等于组号')
assert.equal(buildProductionOrderNo('WO-20260809-001', 1), 'WO-20260809-001-02', '后续行订单号必须追加两位行号')
assert.equal(releasedProductionOrderStatus('material-id', 0), 'RELEASED', 'Material 工单确认后必须进入统一已发布状态')
assert.equal(releasedProductionOrderStatus('material-id', 1), 'RELEASED', 'Material 工单状态不得再表达旧领料进度')
assert.equal(releasedProductionOrderStatus(null, 0), 'PICKED', '无物料投影的历史工单保留旧状态用于收尾')
assert.equal(releasedProductionOrderStatus(null, 1), 'CONFIRMED', '有领料项的历史工单保留旧待领料状态')
assert.equal(productionOrderReleaseError('material-id', 0), null)
assert.match(productionOrderReleaseError('material-id', 1) || '', /历史领料项/, '有旧领料项的 Material 工单必须先治理再发布')
assert.equal(productionOrderReleaseError(null, 1), null, '历史工单继续使用兼容确认流程')
assert.equal(normalizeProductionOrderStatus('CONFIRMED'), 'RELEASED')
assert.equal(normalizeProductionOrderStatus('QC_WAITING'), 'IN_PROGRESS')
assert.deepEqual(
  expandProductionOrderStatusFilters(['RELEASED']),
  ['RELEASED', 'CONFIRMED', 'PICKED', 'DISPATCHED'],
  '按已发布筛选时必须覆盖旧状态别名',
)
assert.equal(productionOrderActualCreationError('DRAFT', 'material-id'), '请先发布生产订单，再登记班后生产实绩')
assert.equal(productionOrderActualCreationError('RELEASED', 'material-id'), null)
assert.equal(productionOrderActualCreationError('PICKED', 'material-id'), null, '旧物料工单状态必须可平滑进入新实绩流程')
assert.equal(productionOrderDispatchError('RELEASED', 'material-id'), null)
assert.equal(productionOrderDispatchError('PICKED', null), null, '历史工单仍可完成旧派工流程')
assert.match(productionOrderDispatchError('DRAFT', 'material-id') || '', /不允许派工/)
assert.equal(productionOrderStatusAfterActual('material-id', false, true), 'IN_PROGRESS')
assert.equal(productionOrderStatusAfterActual('material-id', false, false), 'RELEASED')
assert.equal(productionOrderStatusAfterActual('material-id', true, true), 'COMPLETED')
assert.equal(productionOrderConfirmationError('DRAFT'), null)
assert.equal(productionOrderConfirmationError('PICKED'), '只能确认草稿状态的生产订单')
assert.equal(productionOrderCancellationError('COMPLETED', 0), '已入库工单不可取消，请先创建退货单')
assert.equal(productionOrderCancellationError('DRAFT', 1), '工单已有成品入库记录，不可取消')
assert.equal(cancelProductionOrderSchema.safeParse({ reason: '' }).success, false, '取消生产订单必须填写原因')
assert.equal(createProductionOrderActualSchema.safeParse({ actualDate: '', employeeIds: [], inputs: [], outputs: [] }).success, false, '生产实绩必须包含日期、员工、投入和产出')
const actualDate = parseProductionActualDate('2026-08-09')
assert.equal(buildProductionActualNo(actualDate, 0), 'PA-20260809-001', '首条生产实绩必须使用三位日序号')
assert.equal(buildProductionActualNo(actualDate, 11), 'PA-20260809-012', '生产实绩日序号必须稳定递增')
assert.equal(parseProductionActualSequence('PA-20260809-012', actualDate), 12, '生产实绩必须能从历史编号恢复日序号')
assert.throws(() => parseProductionActualSequence('PA-BROKEN', actualDate), ProductionOrderDomainError, '损坏历史编号必须阻止生成冲突编号')
assert.equal(productionActualDayRange(actualDate).end.getTime() - productionActualDayRange(actualDate).start.getTime(), 24 * 60 * 60 * 1000, '生产实绩编号查询必须限制在同一自然日')
assert.throws(() => parseProductionActualDate('invalid'), ProductionOrderDomainError, '非法生产日期必须返回领域错误')
const validBomSnapshot = JSON.stringify({
  id: 'bom', name: '验证 BOM', version: 'v1', outputQuantity: 1, outputUnit: '件',
  outputs: [{ id: 'out', materialId: 'm-out', quantity: 1, unit: '件', isPrimary: true, material: { code: 'OUT', name: '产出', stockUnit: '件', unit: '件' } }],
  items: [{ id: 'in', materialId: 'm-in', quantity: 2, unit: '件', material: { code: 'IN', name: '投入', stockUnit: '件', unit: '件' } }],
})
assert.equal(parseProductionOrderBomSnapshot(validBomSnapshot).id, 'bom', '有效 BOM 快照必须可解析')
assert.throws(() => parseProductionOrderBomSnapshot('{'), ProductionOrderDomainError, '损坏 BOM 快照必须返回领域错误')
assert.deepEqual(parseProductionActualCostLayerSnapshot(null), [], '无成本层快照时必须返回空集合')
assert.equal(parseProductionActualCostLayerSnapshot('[{"costLayerId":"layer","stockQty":1,"valuationQty":2,"costAmount":3}]')[0].costLayerId, 'layer')
assert.throws(() => parseProductionActualCostLayerSnapshot('[{"costLayerId":""}]'), ProductionOrderDomainError, '损坏成本层快照必须阻止冲销')

const orders = [
  { id: 'line-2', orderNo: 'WO-1-02', groupNo: 'WO-1', lineNo: 2, status: 'DRAFT', planQty: 2, completeQty: 0, scrapQty: 0, createdAt: '', product: { id: 'p2', name: 'B', sku: 'B' }, _count: { actuals: 0 } },
  { id: 'line-1', orderNo: 'WO-1', groupNo: 'WO-1', lineNo: 1, status: 'DRAFT', planQty: 1, completeQty: 0, scrapQty: 0, createdAt: '', product: { id: 'p1', name: 'A', sku: 'A' }, _count: { actuals: 0 } },
]
const grouped = groupProductionOrders(orders)
assert.equal(grouped.length, 1)
assert.deepEqual(grouped[0].lines.map((line) => line.id), ['line-1', 'line-2'], '同组订单必须按行号稳定排序')
assert.deepEqual(buildProductionOrderCreateInput([
  { id: 'draft', targetId: 'material-1', bomId: 'bom-1', planQty: 10 },
], 'PO-001', '加急'), {
  items: [{ targetId: 'material-1', bomId: 'bom-1', planQty: 10 }],
  voucherNo: 'PO-001',
  note: '加急',
})

async function verifyDatabaseRules() {
  const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-production-order-'))
  const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
  execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
    stdio: 'pipe',
  })
  process.env.DATABASE_URL = databaseUrl
  const { prisma } = await import('../lib/prisma')
  const {
    archiveProductionOrder,
    createProductionOrders,
  } = await import('../modules/production/server/production-order-command-service')
  const { ProductionOrderDomainError } = await import('../modules/production/domain/production-order-errors')
  const { getProductionOrderDetail, listProductionOrderOptions, listProductionOrders } = await import('../modules/production/server/production-order-query-service')
  const { cancelProductionOrder, confirmProductionOrder } = await import('../modules/production/server/production-order-status-service')

  try {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const auditContext = {
      operatorId: 'verify-production-order', operatorName: '生产订单审计验证员',
      ipAddress: undefined, userAgent: undefined,
    }
    const [outputMaterial, inputMaterial] = await Promise.all([
      prisma.material.create({ data: { code: `VERIFY-OUT-${suffix}`, name: '验证 生产成品', category: 'FINISHED', unit: '件', stockUnit: '件' } }),
      prisma.material.create({ data: { code: `VERIFY-IN-${suffix}`, name: '验证生产原料', category: 'RAW', unit: '件', stockUnit: '件' } }),
    ])
    const product = await prisma.product.create({ data: { sku: `MAT-${outputMaterial.code}`, name: outputMaterial.name, category: outputMaterial.category, unit: '件' } })
    const bom = await prisma.bOM.create({
      data: {
        productId: product.id,
        name: '验证生产 BOM',
        version: 'v1',
        outputs: { create: { materialId: outputMaterial.id, quantity: 1, unit: '件', isPrimary: true } },
        items: { create: { materialId: inputMaterial.id, outputMaterialId: outputMaterial.id, quantity: 2, unit: '件' } },
      },
    })
    await prisma.bOM.update({
      where: { id: bom.id },
      data: { status: 'RELEASED', isActive: true, isDefault: true, releasedAt: new Date() },
    })

    const created = await createProductionOrders(createProductionOrderSchema.parse({
      voucherNo: 'VERIFY-PO',
      items: [
        { targetId: outputMaterial.id, bomId: bom.id, planQty: 10 },
        { targetId: outputMaterial.id, bomId: bom.id, planQty: 20 },
      ],
    }), fixedDate, auditContext)
    assert.equal(created.items.length, 2, '多物料生产请求必须在同一事务创建全部订单行')
    assert.equal(created.items[0].orderNo, 'WO-20260809-001', '第一条生产订单必须使用组号')
    assert.equal(created.items[1].orderNo, 'WO-20260809-001-02', '后续生产订单必须使用组内行号')
    assert.ok(created.items.every((item) => item.groupNo === 'WO-20260809-001'), '多行生产订单必须共享组号')
    assert.ok(created.items.every((item) => item.bomSnapshot?.includes(inputMaterial.id)), '生产订单必须冻结 BOM 快照')

    const listed = await listProductionOrders({ statuses: ['DRAFT'], keyword: '验证 成品', page: 1, pageSize: 20 })
    assert.equal(listed.items.length, 2, '生产订单查询必须支持空格分隔关键词和状态过滤')
    const [detail, options] = await Promise.all([
      getProductionOrderDetail(created.items[0].id),
      listProductionOrderOptions(),
    ])
    assert.equal(detail?.groupLines.length, 2, '生产订单详情必须装配同组订单行')
    assert.equal(detail?.currentStepId, detail?.routeSteps[0]?.id, '生产订单详情必须计算当前待报工工序')
    assert.equal(options.find((item) => item.id === outputMaterial.id)?.boms[0]?.id, bom.id, '生产订单候选项必须按主产出物料归组启用 BOM')

    const confirmed = await confirmProductionOrder(created.items[0].id, fixedDate)
    assert.equal(confirmed.updated.status, 'RELEASED', 'Material 生产订单确认后必须进入统一已发布状态')
    assert.equal(confirmed.updated.startTime, null, '订单发布不等于实际开工')
    await assert.rejects(() => confirmProductionOrder(created.items[0].id), ProductionOrderDomainError, '非草稿生产订单不得重复确认')

    const location = await prisma.inventoryLocation.create({ data: { code: `VERIFY-LOC-${suffix}`, name: '验证默认库位', isDefault: true } })
    const stock = await prisma.stock.create({
      data: {
        materialId: inputMaterial.id,
        qty: 100,
        reservedQty: 10,
        availableQty: 90,
        valuationQty: 100,
        reservedValuationQty: 10,
        availableValuationQty: 90,
        totalCost: 100,
        locationBalances: { create: { locationId: location.id, qty: 100, reservedQty: 10, availableQty: 90 } },
      },
    })
    const pick = await prisma.pickItem.create({
      data: { orderId: created.items[1].id, materialId: inputMaterial.id, requiredQty: 10, reservedValuationQty: 10, status: 'RESERVED' },
    })
    await cancelProductionOrder(
      created.items[1].id,
      cancelProductionOrderSchema.parse({ reason: '验证取消' }),
      fixedDate,
      auditContext,
    )
    const [cancelled, releasedStock, releasedBalance, cancelledPick] = await Promise.all([
      prisma.productionOrder.findUniqueOrThrow({ where: { id: created.items[1].id } }),
      prisma.stock.findUniqueOrThrow({ where: { id: stock.id } }),
      prisma.stockLocationBalance.findUniqueOrThrow({ where: { stockId_locationId: { stockId: stock.id, locationId: location.id } } }),
      prisma.pickItem.findUniqueOrThrow({ where: { id: pick.id } }),
    ])
    assert.equal(cancelled.status, 'CANCELLED', '取消生产订单必须写入取消状态')
    assert.deepEqual([releasedStock.reservedQty, releasedStock.availableQty], [0, 100], '取消生产订单必须释放总库存预留')
    assert.deepEqual([releasedBalance.reservedQty, releasedBalance.availableQty], [0, 100], '取消生产订单必须释放库位预留')
    assert.equal(cancelledPick.status, 'CANCELLED', '未实际领用的领料明细必须标记取消')
    await assert.rejects(() => cancelProductionOrder(created.items[1].id, { reason: '重复取消' }), ProductionOrderDomainError, '已取消订单不得重复取消')

    const auditLogs = await prisma.auditLog.findMany({
      where: { operatorId: auditContext.operatorId, entityType: 'ORDER' },
      orderBy: { createdAt: 'asc' },
    })
    assert.deepEqual(auditLogs.map((log) => log.action), ['CREATE', 'CREATE', 'CANCEL'])
    assert.equal(auditLogs.every((log) => Boolean(log.afterData)), true, '订单创建与取消审计必须保留结果快照')
    assert.ok(auditLogs[2].beforeData, '订单取消审计必须保留取消前快照')

    const archived = await archiveProductionOrder(created.items[0].id)
    assert.ok(archived.updated.deletedAt, '生产订单归档必须由领域服务设置删除时间')
    await assert.rejects(() => archiveProductionOrder(created.items[0].id), ProductionOrderDomainError, '已归档订单不得重复归档')

    const afterArchive = await listProductionOrders({ statuses: [], keyword: '验证 成品', page: 1, pageSize: 20 })
    assert.equal(afterArchive.items.length, 1, '归档订单不得继续出现在生产订单列表，已取消订单仍保留追溯')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

verifyDatabaseRules()
  .then(() => console.log('生产订单垂直模块验证通过：创建、详情、候选、确认、取消、归档与临时数据库事务符合预期。'))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
