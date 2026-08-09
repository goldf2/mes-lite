import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProductionOrderSchema } from '../modules/production/contracts/production-order-schema'
import { buildProductionOrderGroupNo, buildProductionOrderNo } from '../modules/production/domain/production-order-numbering'
import { buildProductionOrderCreateInput, groupProductionOrders } from '../modules/production/model/production-order-view'

const root = process.cwd()
const requiredFiles = [
  'modules/production/client/production-order-api.ts',
  'modules/production/contracts/production-order.ts',
  'modules/production/contracts/production-order-schema.ts',
  'modules/production/domain/production-order-numbering.ts',
  'modules/production/model/production-order-view.ts',
  'modules/production/server/production-order-command-service.ts',
  'modules/production/server/production-order-query-service.ts',
  'modules/production/ui/ProductionOrderModule.tsx',
]
for (const path of requiredFiles) assert.ok(existsSync(join(root, path)), `生产订单模块缺少文件：${path}`)

const pageSource = readFileSync(join(root, 'modules/production/ui/ProductionOrderModule.tsx'), 'utf8')
const clientSource = readFileSync(join(root, 'modules/production/client/production-order-api.ts'), 'utf8')
const indexSource = readFileSync(join(root, 'modules/production/index.ts'), 'utf8')
const routeSource = readFileSync(join(root, 'app/api/orders/route.ts'), 'utf8')
const commandSource = readFileSync(join(root, 'modules/production/server/production-order-command-service.ts'), 'utf8')
const querySource = readFileSync(join(root, 'modules/production/server/production-order-query-service.ts'), 'utf8')
assert.ok(pageSource.split('\n').length <= 480, '生产订单协调页应保持在 480 行内')
assert.doesNotMatch(pageSource, /\bfetch\(/, '生产订单页面不得直接调用 fetch')
assert.match(pageSource, /loadProductionOrders\(/, '生产订单页面必须通过领域 client 读取列表')
assert.match(pageSource, /createProductionOrders\(/, '生产订单页面必须通过领域 client 创建订单')
assert.match(clientSource, /\/api\/orders\/options/, '生产订单 client 必须集中候选项接口')
assert.match(clientSource, /\/api\/orders\/\$\{encodeURIComponent\(orderId\)\}/, '生产订单 client 必须集中详情接口')
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

assert.equal(createProductionOrderSchema.safeParse({ items: [] }).success, false, '生产订单必须包含至少一项物料')
assert.equal(createProductionOrderSchema.safeParse({ targetId: 'material', bomId: 'bom', planQty: 1 }).success, true, '旧单行请求契约必须继续兼容')
assert.equal(createProductionOrderSchema.safeParse({ items: Array.from({ length: 51 }, () => ({ targetId: 'material', bomId: 'bom', planQty: 1 })) }).success, false, '单张生产订单最多允许 50 项')
const fixedDate = new Date('2026-08-09T08:00:00.000Z')
assert.equal(buildProductionOrderGroupNo(fixedDate, 0), 'WO-20260809-001', '生产订单组号必须按日期和当日序号生成')
assert.equal(buildProductionOrderNo('WO-20260809-001', 0), 'WO-20260809-001', '第一行订单号必须等于组号')
assert.equal(buildProductionOrderNo('WO-20260809-001', 1), 'WO-20260809-001-02', '后续行订单号必须追加两位行号')

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
    ProductionOrderDomainError,
  } = await import('../modules/production/server/production-order-command-service')
  const { listProductionOrders } = await import('../modules/production/server/production-order-query-service')

  try {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
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

    const created = await createProductionOrders(createProductionOrderSchema.parse({
      voucherNo: 'VERIFY-PO',
      items: [
        { targetId: outputMaterial.id, bomId: bom.id, planQty: 10 },
        { targetId: outputMaterial.id, bomId: bom.id, planQty: 20 },
      ],
    }), fixedDate)
    assert.equal(created.items.length, 2, '多物料生产请求必须在同一事务创建全部订单行')
    assert.equal(created.items[0].orderNo, 'WO-20260809-001', '第一条生产订单必须使用组号')
    assert.equal(created.items[1].orderNo, 'WO-20260809-001-02', '后续生产订单必须使用组内行号')
    assert.ok(created.items.every((item) => item.groupNo === 'WO-20260809-001'), '多行生产订单必须共享组号')
    assert.ok(created.items.every((item) => item.bomSnapshot?.includes(inputMaterial.id)), '生产订单必须冻结 BOM 快照')

    const listed = await listProductionOrders({ statuses: ['DRAFT'], keyword: '验证 成品', page: 1, pageSize: 20 })
    assert.equal(listed.items.length, 2, '生产订单查询必须支持空格分隔关键词和状态过滤')
    const archived = await archiveProductionOrder(created.items[0].id)
    assert.ok(archived.updated.deletedAt, '生产订单归档必须由领域服务设置删除时间')
    await assert.rejects(() => archiveProductionOrder(created.items[0].id), ProductionOrderDomainError, '已归档订单不得重复归档')

    const afterArchive = await listProductionOrders({ statuses: [], keyword: '验证 成品', page: 1, pageSize: 20 })
    assert.equal(afterArchive.items.length, 1, '归档订单不得继续出现在生产订单列表')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

verifyDatabaseRules()
  .then(() => console.log('生产订单垂直模块验证通过：页面、契约、client、纯编号规则、薄 API、服务边界及临时数据库事务符合预期。'))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
