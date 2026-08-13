import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dispatchPriorityLabels, dispatchStatusOptions } from '../modules/production/contracts/dispatch'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-dispatch-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

function verifyStaticBoundaries() {
  const pagePath = 'modules/production/ui/DispatchPageModule.tsx'
  const page = read(pagePath)
  const client = read('modules/production/client/dispatch-api.ts')
  const registry = read('app/components/shell/WorkspacePageRendererRegistry.tsx')
  const publicEntry = read('modules/production/index.ts')
  assert.ok(!existsSync(join(root, 'app/components/DispatchPage.tsx')), '派工页不得回流根级页面目录')
  assert.ok(page.split('\n').length <= 650, '派工页面协调层必须保持为不超过 650 行')
  assert.doesNotMatch(page, /\bfetch\(/, '派工页面不得直接发起 HTTP 请求')
  assert.match(page, /from '\.\.\/client\/dispatch-api'/, '派工页面必须通过领域客户端访问 HTTP')
  assert.match(page, /DraftDocumentAttachmentPanel/, '派工新建任务必须保留公共暂存附件')
  assert.match(page, /generateBusinessDocumentPdfArchives/, '派工创建后必须保留业务 PDF 归档')
  assert.match(client, /export async function listDispatches/, '派工客户端必须提供列表查询')
  assert.match(client, /export function createDispatch/, '派工客户端必须提供新建命令')
  assert.match(client, /export function transitionDispatch/, '派工客户端必须提供状态流转命令')
  assert.match(publicEntry, /DispatchPageModule/, '生产模块公开出口必须暴露派工页')
  assert.match(registry, /module\.DispatchPageModule/, '页面渲染注册必须通过生产模块公开出口加载派工页')

  const requiredFiles = [
    'modules/production/contracts/dispatch-schema.ts',
    'modules/production/domain/dispatch-errors.ts',
    'modules/production/domain/dispatch-numbering.ts',
    'modules/production/domain/dispatch-status.ts',
    'modules/production/server/dispatch-query-service.ts',
    'modules/production/server/dispatch-command-service.ts',
    'modules/production/server/dispatch-status-service.ts',
  ]
  for (const file of requiredFiles) assert.ok(existsSync(join(root, file)), `派工领域缺少文件：${file}`)
  const routes = [
    'app/api/dispatches/route.ts',
    'app/api/dispatches/[id]/route.ts',
    'app/api/dispatches/[id]/dispatch/route.ts',
    'app/api/dispatches/[id]/start/route.ts',
    'app/api/dispatches/[id]/complete/route.ts',
    'app/api/dispatches/[id]/cancel/route.ts',
  ]
  for (const routePath of routes) {
    const route = read(routePath)
    assert.ok(route.split('\n').length <= 100, `派工 API 必须保持不超过 100 行：${routePath}`)
    assert.doesNotMatch(route, /@\/lib\/prisma|\bprisma\.|\$transaction\(/, `派工 API 不得直接访问 Prisma：${routePath}`)
    assert.match(route, /@\/modules\/production\//, `派工 API 必须委托生产领域：${routePath}`)
  }
  const services = requiredFiles.filter((file) => file.includes('/server/')).map(read).join('\n')
  assert.doesNotMatch(services, /NextRequest|NextResponse|requireResourcePermission|writeAuditLog/, '派工领域服务不得依赖 HTTP、权限或请求审计')
  assert.deepEqual(dispatchStatusOptions.map((option) => option.value), ['PENDING', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  assert.equal(dispatchPriorityLabels.URGENT, '紧急')
}

async function main() {
  const [
    { prisma },
    { createDispatchSchema },
    { DispatchDomainError },
    { nextDispatchNumber },
    { buildDispatchTransition, dispatchTransitionError },
    { archiveManagedDispatch, createManagedDispatch },
    { getManagedDispatch, listManagedDispatches },
    { transitionManagedDispatch },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/production/contracts/dispatch-schema'),
    import('../modules/production/domain/dispatch-errors'),
    import('../modules/production/domain/dispatch-numbering'),
    import('../modules/production/domain/dispatch-status'),
    import('../modules/production/server/dispatch-command-service'),
    import('../modules/production/server/dispatch-query-service'),
    import('../modules/production/server/dispatch-status-service'),
  ])
  try {
    verifyStaticBoundaries()
    const fixedNow = new Date('2026-08-10T09:00:00.000Z')
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const customer = await prisma.customer.create({ data: { code: `VERIFY-C-${suffix}`, name: `验证客户 ${suffix}` } })
    const product = await prisma.product.create({
      data: { sku: `VERIFY-P-${suffix}`, name: `验证产品 ${suffix}`, category: 'FINISHED', unit: '件', customerId: customer.id },
    })
    const material = await prisma.material.create({
      data: { code: `VERIFY-P-${suffix}`, name: `验证产品 ${suffix}`, category: 'FINISHED', unit: '件', stockUnit: '件', customerId: customer.id },
    })
    const route = await prisma.processRoute.create({
      data: {
        productId: product.id, name: '验证路线', isDefault: true,
        steps: { create: [{ stepNo: 10, name: '成型', workstation: '一号机' }, { stepNo: 20, name: '检验' }] },
      },
      include: { steps: true },
    })
    const otherProduct = await prisma.product.create({
      data: { sku: `VERIFY-OTHER-${suffix}`, name: '其他产品', category: 'FINISHED', unit: '件' },
    })
    const otherRoute = await prisma.processRoute.create({
      data: { productId: otherProduct.id, name: '其他路线', steps: { create: [{ stepNo: 10, name: '其他工序' }] } },
      include: { steps: true },
    })
    const order = await prisma.productionOrder.create({
      data: { orderNo: `VERIFY-O-${suffix}`, productId: product.id, materialId: material.id, planQty: 100, status: 'RELEASED' },
    })
    const employee = await prisma.employee.create({
      data: { code: `VERIFY-E-${suffix}`, name: '验证工人', isActive: true },
    })
    const draftOrder = await prisma.productionOrder.create({
      data: { orderNo: `VERIFY-DRAFT-${suffix}`, productId: product.id, planQty: 10, status: 'DRAFT' },
    })
    await prisma.dispatch.create({
      data: {
        dispatchNo: 'DP-20260810-009', orderId: order.id, stepId: route.steps[0].id,
        workerName: '历史工人', planQty: 1, status: 'CANCELLED',
      },
    })

    const input = createDispatchSchema.parse({
      orderId: order.id, stepId: route.steps[0].id, employeeId: employee.id,
      planQty: 80, priority: 'HIGH', voucherNo: ' V-001 ', note: ' 首工序 ',
    })
    const created = await createManagedDispatch(input, fixedNow)
    assert.equal(created.dispatchNo, 'DP-20260810-010', '派工编号必须从当日最大历史序号递增')
    assert.deepEqual([created.workerName, created.voucherNo, created.note], ['验证工人', 'V-001', '首工序'])
    assert.equal(nextDispatchNumber(fixedNow, 'DP-20260810-019'), 'DP-20260810-020')
    assert.equal((await getManagedDispatch(created.id)).step.name, '成型')

    const listed = await listManagedDispatches({
      statuses: ['PENDING'], workerName: '验证', customerId: customer.id, page: 1, pageSize: 20,
    })
    assert.equal(listed.items.some((item) => item.id === created.id), true, '派工查询必须支持状态、工人和客户组合过滤')

    const dispatched = await transitionManagedDispatch(created.id, 'dispatch', fixedNow)
    assert.equal(dispatched.updated.status, 'DISPATCHED')
    assert.equal(dispatched.updated.dispatchedAt?.toISOString(), fixedNow.toISOString())
    await assert.rejects(() => transitionManagedDispatch(created.id, 'dispatch'), /只能确认待派工/)
    const started = await transitionManagedDispatch(created.id, 'start', fixedNow)
    assert.equal(started.updated.status, 'IN_PROGRESS')
    const completed = await transitionManagedDispatch(created.id, 'complete', fixedNow)
    assert.equal(completed.updated.status, 'COMPLETED')
    await assert.rejects(() => transitionManagedDispatch(created.id, 'cancel'), /只能取消待派工或已派工/)

    const cancellable = await createManagedDispatch({ ...input, stepId: route.steps[1].id }, fixedNow)
    assert.equal(cancellable.dispatchNo, 'DP-20260810-011')
    const cancelled = await transitionManagedDispatch(cancellable.id, 'cancel', fixedNow)
    assert.equal(cancelled.updated.status, 'CANCELLED')
    await assert.rejects(() => transitionManagedDispatch(cancellable.id, 'start'), /只能开始已派工/)

    await assert.rejects(
      () => createManagedDispatch({ ...input, orderId: draftOrder.id }, fixedNow),
      /工单状态不允许派工/,
    )
    await assert.rejects(
      () => createManagedDispatch({ ...input, stepId: otherRoute.steps[0].id }, fixedNow),
      /工序不属于该工单物料/,
    )
    const archived = await archiveManagedDispatch(created.id)
    assert.ok(archived.updated.deletedAt)
    await assert.rejects(() => getManagedDispatch(created.id), DispatchDomainError)

    assert.equal(dispatchTransitionError('PENDING', 'dispatch'), null)
    assert.match(dispatchTransitionError('COMPLETED', 'cancel') ?? '', /只能取消/)
    assert.equal(buildDispatchTransition('DISPATCHED', 'start', fixedNow).data?.status, 'IN_PROGRESS')
    console.log('派工垂直模块验证通过：编号、工序归属、组合查询、创建、派工、开工、完工、取消、归档与重复状态拒绝符合预期')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
