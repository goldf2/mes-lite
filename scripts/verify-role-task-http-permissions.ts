import assert from 'node:assert/strict'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-role-http-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
let server: ChildProcess | null = null

async function availablePort() {
  return new Promise<number>((resolve, reject) => {
    const listener = createServer()
    listener.once('error', reject)
    listener.listen(0, '127.0.0.1', () => {
      const address = listener.address()
      const port = typeof address === 'object' && address ? address.port : 0
      listener.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

async function waitUntilReady(baseUrl: string, process: ChildProcess) {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error(`Next.js 验证服务已退出：${process.exitCode}`)
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) return
    } catch {
      // 等待本地验证服务完成编译。
    }
    await delay(300)
  }
  throw new Error('Next.js 验证服务启动超时')
}

async function stopServer(process: ChildProcess | null) {
  if (!process || process.exitCode !== null) return
  process.kill('SIGTERM')
  await Promise.race([
    new Promise<void>((resolve) => process.once('exit', () => resolve())),
    delay(3_000).then(() => { if (process.exitCode === null) process.kill('SIGKILL') }),
  ])
}

async function main() {
  execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
    stdio: 'pipe',
  })
  process.env.DATABASE_URL = databaseUrl
  const [
    { prisma },
    { hashPassword },
    { ensureDefaultPermissions },
    { postInventoryReceipt },
    { createManagedShipment, createManagedReturn },
    { shipManagedShipment },
    { createManagedFlowTransfer },
    { confirmManagedFlowTransfer },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/auth'),
    import('../lib/permissions'),
    import('../lib/inventory'),
    import('../modules/sales/server/fulfillment-command-service'),
    import('../modules/sales/server/fulfillment-status-service'),
    import('../modules/production/server/flow-transfer-command-service'),
    import('../modules/production/server/flow-transfer-status-service'),
  ])
  await ensureDefaultPermissions()
  const groups = await prisma.permissionGroup.findMany({ where: { code: { in: [
    'base_access', 'production_executor', 'production_lead', 'production_planner',
    'warehouse_executor', 'warehouse_lead', 'sales_fulfillment',
  ] } } })
  const groupByCode = new Map(groups.map((group) => [group.code, group.id]))
  const createOperator = (username: string, jobCode: string) => prisma.operator.create({
    data: {
      username,
      passwordHash: hashPassword('VerifyRole123!'),
      name: username,
      role: 'OPERATOR',
      status: 'ACTIVE',
      permissionGroups: { create: [
        { groupId: groupByCode.get('base_access')! },
        { groupId: groupByCode.get(jobCode)! },
      ] },
    },
  })
  await Promise.all([
    createOperator('verify-executor', 'production_executor'),
    createOperator('verify-lead', 'production_lead'),
    createOperator('verify-planner', 'production_planner'),
    createOperator('verify-warehouse', 'warehouse_executor'),
    createOperator('verify-warehouse-lead', 'warehouse_lead'),
    createOperator('verify-sales', 'sales_fulfillment'),
  ])
  await prisma.permissionGroup.create({ data: {
    code: 'verify-generic-logistics-editor', name: '通用物流编辑验证组',
    settings: { create: [
      { resource: 'shipment', canRead: true, canCreate: true, canUpdate: true, canDelete: false, canGrant: false },
      { resource: 'return', canRead: true, canCreate: true, canUpdate: true, canDelete: false, canGrant: false },
      { resource: 'flowTransfers', canRead: true, canCreate: true, canUpdate: true, canDelete: false, canGrant: false },
    ] },
    operators: { create: { operator: { create: {
      username: 'verify-generic-logistics-editor', passwordHash: hashPassword('VerifyRole123!'),
      name: '通用物流编辑验证员', role: 'OPERATOR', status: 'ACTIVE',
    } } } },
  } })

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const [sourceLocation, targetLocation, returnLocation, customer, material, employee] = await Promise.all([
    prisma.inventoryLocation.create({ data: { code: `LOG-SRC-${suffix}`, name: '物流命令来源库位', isDefault: true } }),
    prisma.inventoryLocation.create({ data: { code: `LOG-DST-${suffix}`, name: '物流命令目标库位' } }),
    prisma.inventoryLocation.create({ data: { code: `LOG-RT-${suffix}`, name: '物流命令退货库位' } }),
    prisma.customer.create({ data: { code: `LOG-CUS-${suffix}`, name: '物流命令客户' } }),
    prisma.material.create({ data: {
      code: `LOG-MAT-${suffix}`, name: '物流命令验证成品', category: 'FINISHED',
      unit: '件', stockUnit: '件', valuationUnit: '件', conversionRate: 1,
    } }),
    prisma.employee.create({ data: { code: `LOG-EMP-${suffix}`, name: '物流命令验证员工' } }),
  ])
  await prisma.$transaction((tx) => postInventoryReceipt(tx, {
    materialId: material.id, stockQty: 200, valuationQty: 200, costAmount: 2000,
    type: 'VERIFY_IN', refType: 'VERIFY', refId: suffix, note: '物流命令 HTTP 验证期初',
    idempotencyKey: `VERIFY:LOGISTICS_COMMAND:${suffix}`, locationId: sourceLocation.id,
  }))
  const fixedNow = new Date('2026-08-14T08:00:00.000Z')
  const shipmentToShip = await createManagedShipment({ materialId: material.id, customerId: customer.id, locationId: sourceLocation.id, qty: 10 }, fixedNow)
  const shipmentToCancel = await createManagedShipment({ materialId: material.id, customerId: customer.id, locationId: sourceLocation.id, qty: 5 }, fixedNow)
  const shipmentToDeliver = await createManagedShipment({ materialId: material.id, customerId: customer.id, locationId: sourceLocation.id, qty: 30 }, fixedNow)
  await shipManagedShipment(shipmentToDeliver.id, '验证预置发货员')
  const returnToReceive = await createManagedReturn({
    shipmentId: shipmentToDeliver.id, productId: shipmentToDeliver.productId,
    locationId: returnLocation.id, qty: 5, reason: '验证接收入库',
  }, fixedNow)
  const returnToReject = await createManagedReturn({
    shipmentId: shipmentToDeliver.id, productId: shipmentToDeliver.productId,
    locationId: returnLocation.id, qty: 5, reason: '验证拒绝退货',
  }, fixedNow)
  const transferInput = {
    transferDate: '2026-08-14', materialId: material.id, sourceLocationId: sourceLocation.id,
    targetLocationId: targetLocation.id, quantity: 10, employeeId: employee.id, note: '物流命令 HTTP 验证',
  }
  const transferToConfirm = await createManagedFlowTransfer(transferInput)
  const transferToReverse = await createManagedFlowTransfer(transferInput)
  await confirmManagedFlowTransfer(transferToReverse.id, '验证预置移库员', fixedNow)
  await prisma.$disconnect()

  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  server = spawn(join(root, 'node_modules', '.bin', 'next'), ['dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await waitUntilReady(baseUrl, server)

  const login = async (username: string) => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl },
      body: JSON.stringify({ username, password: 'VerifyRole123!' }),
    })
    assert.equal(response.status, 200, `${username} 必须能登录验证服务`)
    const cookie = response.headers.get('set-cookie')?.split(';')[0]
    assert.ok(cookie, `${username} 登录必须返回会话 Cookie`)
    return cookie
  }
  const requestStatus = async (cookie: string, path: string, body?: unknown) => (await fetch(`${baseUrl}${path}`, {
    method: 'PATCH',
    headers: { Cookie: cookie, Origin: baseUrl, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })).status

  const executorCookie = await login('verify-executor')
  assert.equal(await requestStatus(executorCookie, '/api/orders/not-found/confirm'), 403, '生产执行人员越权发布必须返回 403')
  assert.equal(await requestStatus(executorCookie, '/api/orders/not-found/actuals/not-found/confirm', {}), 403, '生产执行人员越权确认过账必须返回 403')
  assert.equal(await requestStatus(executorCookie, '/api/orders/not-found/actuals/not-found/reverse', { reason: '验证越权' }), 403, '生产执行人员越权冲销必须返回 403')

  const plannerCookie = await login('verify-planner')
  const plannerEntry = await fetch(`${baseUrl}/api/orders/not-found/actuals`, {
    method: 'POST', headers: { Cookie: plannerCookie, Origin: baseUrl, 'Content-Type': 'application/json' }, body: '{}',
  })
  assert.equal(plannerEntry.status, 403, '计划员越权登记实绩草稿必须返回 403')
  assert.equal(await requestStatus(plannerCookie, '/api/orders/not-found/actuals/not-found/confirm', {}), 403, '计划员越权确认过账必须返回 403')
  assert.equal(await requestStatus(plannerCookie, '/api/orders/not-found/actuals/not-found/reverse', { reason: '验证越权' }), 403, '计划员越权冲销必须返回 403')

  const leadCookie = await login('verify-lead')
  assert.notEqual(await requestStatus(leadCookie, '/api/orders/not-found/confirm'), 403, '生产主管发布命令不得被权限门禁拒绝')
  assert.notEqual(await requestStatus(leadCookie, '/api/orders/not-found/actuals/not-found/confirm', {}), 403, '生产主管确认命令不得被权限门禁拒绝')

  const genericEditorCookie = await login('verify-generic-logistics-editor')
  assert.equal(await requestStatus(genericEditorCookie, '/api/shipments/not-found/ship'), 403, '发货单通用编辑不得执行库存发出')
  assert.equal(await requestStatus(genericEditorCookie, '/api/shipments/not-found/deliver'), 403, '发货单通用编辑不得确认客户签收')
  assert.equal(await requestStatus(genericEditorCookie, '/api/shipments/not-found/cancel'), 403, '发货单通用编辑不得取消单据')
  assert.equal(await requestStatus(genericEditorCookie, '/api/returns/not-found/process', {}), 403, '退货单通用编辑不得执行退货收货')
  assert.equal(await requestStatus(genericEditorCookie, '/api/returns/not-found/reject'), 403, '退货单通用编辑不得拒绝退货')
  assert.equal(await requestStatus(genericEditorCookie, '/api/flow-transfers/not-found/confirm', {}), 403, '流程转移通用编辑不得移动库存')
  assert.equal(await requestStatus(genericEditorCookie, '/api/flow-transfers/not-found/reverse', { reason: '验证越权' }), 403, '流程转移通用编辑不得冲销库存')

  const warehouseCookie = await login('verify-warehouse')
  assert.notEqual(await requestStatus(warehouseCookie, '/api/shipments/not-found/ship'), 403, '普通仓管发货执行必须通过命令门禁')
  assert.equal(await requestStatus(warehouseCookie, '/api/shipments/not-found/deliver'), 403, '普通仓管不得代替销售确认客户签收')
  assert.equal(await requestStatus(warehouseCookie, '/api/shipments/not-found/cancel'), 403, '普通仓管不得取消发货单')
  assert.notEqual(await requestStatus(warehouseCookie, '/api/returns/not-found/process', {}), 403, '普通仓管退货收货必须通过命令门禁')
  assert.equal(await requestStatus(warehouseCookie, '/api/returns/not-found/reject'), 403, '普通仓管不得拒绝退货')
  assert.notEqual(await requestStatus(warehouseCookie, '/api/flow-transfers/not-found/confirm', {}), 403, '普通仓管移库确认必须通过命令门禁')
  assert.equal(await requestStatus(warehouseCookie, '/api/flow-transfers/not-found/reverse', { reason: '验证越权' }), 403, '普通仓管不得冲销移库')

  const warehouseLeadCookie = await login('verify-warehouse-lead')
  assert.notEqual(await requestStatus(warehouseLeadCookie, '/api/shipments/not-found/cancel'), 403, '仓库主管取消发货必须通过命令门禁')
  assert.notEqual(await requestStatus(warehouseLeadCookie, '/api/returns/not-found/reject'), 403, '仓库主管拒绝退货必须通过命令门禁')
  assert.notEqual(await requestStatus(warehouseLeadCookie, '/api/flow-transfers/not-found/reverse', { reason: '验证主管冲销' }), 403, '仓库主管移库冲销必须通过命令门禁')

  const salesCookie = await login('verify-sales')
  assert.equal(await requestStatus(salesCookie, '/api/shipments/not-found/ship'), 403, '销售跟单不得执行库存发出')
  assert.notEqual(await requestStatus(salesCookie, '/api/shipments/not-found/deliver'), 403, '销售跟单确认客户签收必须通过命令门禁')
  assert.notEqual(await requestStatus(salesCookie, '/api/shipments/not-found/cancel'), 403, '销售跟单取消待发货单必须通过命令门禁')
  assert.equal(await requestStatus(salesCookie, '/api/returns/not-found/process', {}), 403, '销售跟单不得执行退货入库')
  assert.notEqual(await requestStatus(salesCookie, '/api/returns/not-found/reject'), 403, '销售跟单拒绝退货必须通过命令门禁')

  assert.equal(await requestStatus(warehouseCookie, `/api/shipments/${shipmentToShip.id}/ship`), 200, '普通仓管必须能真实执行库存发出')
  assert.equal(await requestStatus(salesCookie, `/api/shipments/${shipmentToDeliver.id}/deliver`), 200, '销售跟单必须能真实确认客户签收')
  assert.equal(await requestStatus(warehouseLeadCookie, `/api/shipments/${shipmentToCancel.id}/cancel`, { reason: '客户撤销发货' }), 200, '仓库主管必须能有原因取消待发货单')
  assert.equal(await requestStatus(warehouseCookie, `/api/returns/${returnToReceive.id}/process`, {}), 200, '普通仓管必须能真实接收入库退货')
  assert.equal(await requestStatus(salesCookie, `/api/returns/${returnToReject.id}/reject`, { reason: '退货不符合协议' }), 200, '销售跟单必须能有原因拒绝退货')
  assert.equal(await requestStatus(warehouseCookie, `/api/flow-transfers/${transferToConfirm.id}/confirm`, {}), 200, '普通仓管必须能真实确认移库')
  assert.equal(await requestStatus(warehouseLeadCookie, `/api/flow-transfers/${transferToReverse.id}/reverse`, { reason: '目标库位选择错误' }), 200, '仓库主管必须能有原因冲销移库')

  const [shipmentActions, returnActions, flowActions] = await Promise.all([
    prisma.auditLog.findMany({ where: { entityType: 'SHIPMENT', entityId: { in: [shipmentToShip.id, shipmentToDeliver.id, shipmentToCancel.id] } }, orderBy: { createdAt: 'asc' } }),
    prisma.auditLog.findMany({ where: { entityType: 'RETURN', entityId: { in: [returnToReceive.id, returnToReject.id] } }, orderBy: { createdAt: 'asc' } }),
    prisma.auditLog.findMany({ where: { entityType: 'FLOW_TRANSFER', entityId: { in: [transferToConfirm.id, transferToReverse.id] } }, orderBy: { createdAt: 'asc' } }),
  ])
  assert.deepEqual(new Set(shipmentActions.map((item) => item.action)), new Set(['SHIP', 'DELIVER', 'CANCEL']), '发货三个状态动作必须写入审计')
  assert.equal(shipmentActions.find((item) => item.action === 'CANCEL')?.note, '客户撤销发货', '发货取消必须保存原因')
  assert.deepEqual(new Set(returnActions.map((item) => item.action)), new Set(['RECEIVE', 'REJECT']), '退货收货和拒绝必须写入审计')
  assert.equal(returnActions.find((item) => item.action === 'REJECT')?.note, '退货不符合协议', '退货拒绝必须保存原因')
  assert.deepEqual(new Set(flowActions.map((item) => item.action)), new Set(['CONFIRM', 'REVERSE']), '移库确认和冲销必须写入审计')
  assert.equal(flowActions.find((item) => item.action === 'REVERSE')?.note, '目标库位选择错误', '移库冲销必须保存原因')
  await prisma.$disconnect()

  console.log('岗位命令 HTTP 权限验证通过：生产、发货、签收、退货和移库的普通执行与高风险动作均按岗位隔离。')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await stopServer(server)
    rmSync(verifyRoot, { recursive: true, force: true })
  })
