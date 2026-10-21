import assert from 'node:assert/strict'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-granular-http-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
let server: ChildProcess | null = null

async function availablePort() {
  return new Promise<number>((resolve, reject) => {
    const listener = createServer()
    listener.once('error', reject)
    listener.listen(0, '127.0.0.1', () => {
      const address = listener.address()
      listener.close((error) => error ? reject(error) : resolve(typeof address === 'object' && address ? address.port : 0))
    })
  })
}

async function waitUntilReady(baseUrl: string, process: ChildProcess) {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error(`Next.js 验证服务已退出：${process.exitCode}`)
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return } catch { /* 等待编译 */ }
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
    cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
  })
  process.env.DATABASE_URL = databaseUrl
  const [{ prisma }, { hashPassword }, { ensureDefaultPermissions }] = await Promise.all([
    import('../lib/prisma'), import('../lib/auth'), import('../lib/permissions'),
  ])
  await ensureDefaultPermissions()

  const groupSpecs = [
    { code: 'verify_supplier', resource: 'suppliers', flags: { canRead: true, canCreate: true, canUpdate: true, canDelete: true } },
    { code: 'verify_ai', resource: 'aiSettings', flags: { canRead: true, canCreate: false, canUpdate: true, canDelete: false } },
    { code: 'verify_stats', resource: 'stats', flags: { canRead: true, canCreate: false, canUpdate: false, canDelete: false } },
    { code: 'verify_flow', resource: 'flowTransfers', flags: { canRead: true, canCreate: true, canUpdate: true, canDelete: false } },
    { code: 'verify_bom', resource: 'bom', flags: { canRead: true, canCreate: true, canUpdate: true, canDelete: true } },
    { code: 'verify_shipment_edit', resource: 'shipment', flags: { canRead: true, canCreate: false, canUpdate: true, canDelete: false } },
    { code: 'verify_shipment_read', resource: 'shipment', flags: { canRead: true, canCreate: false, canUpdate: false, canDelete: false } },
    { code: 'verify_shipment_create', resource: 'shipment', flags: { canRead: true, canCreate: true, canUpdate: false, canDelete: false } },
  ]
  for (const spec of groupSpecs) {
    await prisma.permissionGroup.create({ data: {
      code: spec.code, name: spec.code,
      settings: { create: { resource: spec.resource, ...spec.flags, canGrant: false } },
      operators: { create: { operator: { create: {
        username: spec.code, passwordHash: hashPassword('VerifyGranular123!'), name: spec.code, role: 'OPERATOR', status: 'ACTIVE',
      } } } },
    } })
  }
  const [inventory, { createWarehousePackage }, { createManagedShipment }] = await Promise.all([
    import('../modules/inventory'), import('../modules/inventory/server/warehouse-package-command-service'), import('../modules/sales/server/fulfillment-command-service'),
  ])
  const customer = await prisma.customer.create({ data: { code: 'HTTP-DRAFT-CUS', name: 'HTTP草稿客户' } })
  const location = await prisma.inventoryLocation.create({ data: { code: 'HTTP-DRAFT-LOC', name: 'HTTP草稿库位', isDefault: true } })
  const material = await prisma.material.create({ data: { code: 'HTTP-DRAFT-MAT', name: 'HTTP草稿产品', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件', costingMethod: 'FIFO' } })
  const lot = await prisma.$transaction(async (tx) => {
    const receipt = await inventory.postInventoryReceipt(tx, { materialId: material.id, locationId: location.id, stockQty: 10, valuationQty: 10, costAmount: 100, type: 'VERIFY_IN', refType: 'VERIFY_HTTP', refId: 'HTTP-DRAFT', note: 'HTTP草稿期初', idempotencyKey: 'HTTP-DRAFT:IN' })
    return inventory.createInventoryLotReceipt(tx, { lotNo: 'HTTP-DRAFT-LOT', materialId: material.id, sourceType: 'VERIFY_HTTP', sourceId: 'HTTP-DRAFT', locationId: location.id, inventoryStatus: 'AVAILABLE', stockQty: 10, valuationQty: 10, costAmount: 100, stockLogId: receipt.movement!.id, costLayerId: receipt.costLayer?.id, idempotencyKey: 'HTTP-DRAFT:LOT' })
  })
  const draftBox = await createWarehousePackage({ inventoryLotId: lot.id, locationId: location.id, quantity: 4, packagingType: 'CARTON', packedBy: 'HTTP包装员', packedAt: '2026-10-21T01:00:00.000Z', clientRequestId: 'HTTP-DRAFT:BOX' }, 'HTTP仓库员')
  const shipment = await createManagedShipment({ customerId: customer.id, items: [{ materialId: material.id, locationId: location.id, qty: 1 }] })
  await prisma.$disconnect()

  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  server = spawn(join(root, 'node_modules', '.bin', 'next'), ['dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  await waitUntilReady(baseUrl, server)

  const login = async (username: string) => {
    const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl }, body: JSON.stringify({ username, password: 'VerifyGranular123!' }) })
    assert.equal(response.status, 200, `${username} 必须能登录`)
    return response.headers.get('set-cookie')!.split(';')[0]
  }
  const status = async (cookie: string, path: string, init: RequestInit = {}) => (await fetch(`${baseUrl}${path}`, {
    ...init, headers: { Cookie: cookie, Origin: baseUrl, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  })).status

  const supplier = await login('verify_supplier')
  assert.notEqual(await status(supplier, '/api/suppliers'), 403, '供应商管理员必须能读取供应商')
  assert.notEqual(await status(supplier, '/api/system/configuration-order?entity=suppliers'), 403, '供应商管理员必须能读取供应商顺序')
  assert.equal(await status(supplier, '/api/system/configuration-order?entity=customers'), 403, '供应商管理员不得读取客户顺序')
  assert.equal(await status(supplier, '/api/ai/config'), 403, '供应商管理员不得读取 AI 密钥配置')

  const ai = await login('verify_ai')
  assert.notEqual(await status(ai, '/api/ai/config'), 403, 'AI 管理员必须能读取 AI 配置')
  assert.equal(await status(ai, '/api/suppliers', { method: 'POST', body: '{}' }), 403, 'AI 管理员不得创建供应商')

  const stats = await login('verify_stats')
  assert.notEqual(await status(stats, '/api/stats/production'), 403, '统计人员必须能读取生产统计')
  assert.equal(await status(stats, '/api/flow-transfers'), 403, '统计人员不得读取流程转移')

  const flow = await login('verify_flow')
  assert.notEqual(await status(flow, '/api/flow-transfers'), 403, '流程转移人员必须能读取转移单')
  assert.equal(await status(flow, '/api/stats/production'), 403, '流程转移人员不得读取统计')

  const bom = await login('verify_bom')
  assert.notEqual(await status(bom, '/api/boms'), 403, 'BOM 工程师必须能读取 BOM')
  assert.equal(await status(bom, '/api/bom-costs'), 403, 'BOM 工程师不得自动读取 BOM 成本')
  assert.equal(await status(bom, '/api/system/settings'), 400, '系统设置必须显式声明业务、显示或 AI 范围')

  const shipmentEditor = await login('verify_shipment_edit')
  const shipmentReader = await login('verify_shipment_read')
  const shipmentCreator = await login('verify_shipment_create')
  const candidates = `/api/warehouse-packages?availableForShipment=true&customerId=${customer.id}`
  const scannedBox = `/api/warehouse-packages/resolve?available=true&code=${encodeURIComponent(`${draftBox.packageNo}#v1`)}`
  assert.equal(await status(shipmentEditor, '/api/sales-orders/shippable'), 403, '仅改权不得获得发货创建选项')
  assert.equal(await status(shipmentEditor, '/api/sales-orders/shippable?context=shipment-draft'), 200, '仅改权必须可加载草稿共享选项')
  assert.equal(await status(shipmentCreator, '/api/sales-orders/shippable'), 200)
  assert.equal(await status(shipmentCreator, '/api/sales-orders/shippable?context=shipment-draft'), 403)
  for (const cookie of [shipmentEditor, shipmentCreator]) {
    assert.equal(await status(cookie, candidates), 200, '发货创建或修改权限均可选可发货箱')
    assert.equal(await status(cookie, scannedBox), 200, '发货创建或修改权限均可扫码可发货箱')
    assert.equal(await status(cookie, '/api/warehouse-packages'), 403, '选箱权不应扩展为仓库装箱资料查看权')
    assert.equal(await status(cookie, '/api/warehouse-packages', { method: 'POST', body: '{}' }), 403, '选箱权不应扩展为库存装箱修改权')
  }
  assert.equal(await status(shipmentReader, candidates), 403)
  assert.equal(await status(shipmentReader, scannedBox), 403)
  assert.equal(await status(shipmentReader, '/api/sales-orders/shippable?context=shipment-draft'), 403)
  const editPayload = JSON.stringify({ mode: 'draft', updatedAt: shipment.updatedAt.toISOString(), customerId: customer.id, items: [{ materialId: material.id, locationId: location.id, qty: 1 }], packageIds: [draftBox.id] })
  for (const cookie of [shipmentReader, shipmentCreator]) assert.equal(await status(cookie, `/api/shipments/${shipment.id}`, { method: 'PATCH', body: editPayload }), 403, '读权或创建权均不可替代修改权')
  assert.equal(await status(shipmentEditor, `/api/shipments/${shipment.id}`, { method: 'PATCH', body: editPayload }), 200, '仅改权可以向已保存草稿追加货箱')
  assert.equal(await status(shipmentEditor, `/api/shipments/${shipment.id}`, { method: 'PATCH', body: editPayload }), 409, '旧版本编辑应返回冲突')
  assert.equal(await status(shipmentEditor, `/api/shipments/${shipment.id}/ship`, { method: 'PATCH' }), 403, '草稿修改权限不能替代确认发货权限')

  console.log('细粒度 HTTP 权限验证通过：供应商、AI、统计、流程转移、BOM 与 BOM 成本相互隔离；发货仅改权可查草稿选项/选箱/扫码/整单保存，创建、只读、库存装箱、确认权与版本冲突分别校验。')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await stopServer(server)
  rmSync(verifyRoot, { recursive: true, force: true })
})
