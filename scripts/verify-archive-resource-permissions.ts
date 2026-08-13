import assert from 'node:assert/strict'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-archive-permissions-'))
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
  const [{ prisma }, { hashPassword }] = await Promise.all([import('../lib/prisma'), import('../lib/auth')])
  const suffix = Date.now().toString()
  const [restoreMaterial, purgeMaterial, hiddenSupplier, allowedLocation, blockedLocation] = await Promise.all([
    prisma.material.create({ data: { code: `ARC-R-${suffix}`, name: '待恢复归档物料', category: 'FINISHED', unit: '件', deletedAt: new Date() } }),
    prisma.material.create({ data: { code: `ARC-P-${suffix}`, name: '待永久删除归档物料', category: 'FINISHED', unit: '件', deletedAt: new Date() } }),
    prisma.supplier.create({ data: { code: `ARC-S-${suffix}`, name: '不可见归档供应商', deletedAt: new Date() } }),
    prisma.inventoryLocation.create({ data: { code: `ARC-LA-${suffix}`, name: '允许库位' } }),
    prisma.inventoryLocation.create({ data: { code: `ARC-LB-${suffix}`, name: '禁止库位' } }),
  ])
  const [restoreReceipt, purgeReceipt, blockedReceipt] = await Promise.all([
    prisma.materialReceipt.create({ data: { inboundNo: `ARC-IN-R-${suffix}`, supplierId: hiddenSupplier.id, stagingLocationId: allowedLocation.id, deletedAt: new Date() } }),
    prisma.materialReceipt.create({ data: { inboundNo: `ARC-IN-P-${suffix}`, supplierId: hiddenSupplier.id, stagingLocationId: allowedLocation.id, deletedAt: new Date() } }),
    prisma.materialReceipt.create({ data: { inboundNo: `ARC-IN-X-${suffix}`, supplierId: hiddenSupplier.id, stagingLocationId: blockedLocation.id, deletedAt: new Date() } }),
  ])
  const password = 'VerifyArchive123!'
  const createOperator = (username: string, settings: Array<{
    resource: string
    canRead?: boolean
    canCreate?: boolean
    canUpdate?: boolean
    canDelete?: boolean
    canGrant?: boolean
  }>) => prisma.operator.create({ data: {
    username, passwordHash: hashPassword(password), name: username, role: 'OPERATOR', status: 'ACTIVE',
    permissionGroups: { create: { group: { create: {
      code: username, name: username, settings: { create: settings },
    } } } },
  } })
  const [, , , , scopedReceiptOperator] = await Promise.all([
    createOperator(`archive-only-${suffix}`, [
      { resource: 'archive', canRead: true, canUpdate: true, canDelete: true },
    ]),
    createOperator(`archive-material-read-${suffix}`, [
      { resource: 'archive', canRead: true, canUpdate: true, canDelete: true },
      { resource: 'materials', canRead: true },
    ]),
    createOperator(`archive-material-manage-${suffix}`, [
      { resource: 'archive', canRead: true, canUpdate: true, canDelete: true },
      { resource: 'materials', canRead: true, canUpdate: true, canDelete: true },
    ]),
    createOperator(`material-only-${suffix}`, [
      { resource: 'materials', canRead: true, canUpdate: true, canDelete: true },
    ]),
    createOperator(`archive-receipt-scope-${suffix}`, [
      { resource: 'archive', canRead: true, canUpdate: true, canDelete: true },
      { resource: 'materialIn', canRead: true, canUpdate: true, canDelete: true },
    ]),
  ])
  await prisma.operatorDataScope.create({ data: {
    operatorId: scopedReceiptOperator.id, productionMode: 'ALL', inventoryMode: 'LOCATIONS',
    locations: { create: { locationId: allowedLocation.id } },
  } })
  await prisma.$disconnect()

  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  server = spawn(join(root, 'node_modules', '.bin', 'next'), ['dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  await waitUntilReady(baseUrl, server)

  const login = async (username: string) => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl }, body: JSON.stringify({ username, password }),
    })
    assert.equal(response.status, 200)
    return response.headers.get('set-cookie')!.split(';')[0]
  }
  const request = (cookie: string, requestPath: string, init: RequestInit = {}) => fetch(`${baseUrl}${requestPath}`, {
    ...init,
    headers: { Cookie: cookie, Origin: baseUrl, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  })

  const materialOnly = await login(`material-only-${suffix}`)
  assert.equal((await request(materialOnly, '/api/deleted-records')).status, 403, '原业务权限不能替代归档入口权限')

  const archiveOnly = await login(`archive-only-${suffix}`)
  const archiveOnlyList = await request(archiveOnly, '/api/deleted-records')
  assert.equal(archiveOnlyList.status, 200)
  assert.deepEqual((await archiveOnlyList.json()).data, {}, '归档入口权限不得泄露未授权业务对象')
  assert.equal((await request(archiveOnly, '/api/deleted-records?model=material')).status, 403)
  assert.equal((await request(archiveOnly, '/api/restore', {
    method: 'PATCH', body: JSON.stringify({ model: 'material', id: restoreMaterial.id }),
  })).status, 403)
  assert.equal((await request(archiveOnly, '/api/deleted-records', {
    method: 'DELETE', body: JSON.stringify({ model: 'material', id: purgeMaterial.id, confirmation: '永久删除' }),
  })).status, 403)

  const materialRead = await login(`archive-material-read-${suffix}`)
  const filteredList = await request(materialRead, '/api/deleted-records')
  assert.equal(filteredList.status, 200)
  const filteredData = (await filteredList.json()).data as Record<string, Array<{ id: string }>>
  assert.deepEqual(filteredData.materials.map((item) => item.id).sort(), [purgeMaterial.id, restoreMaterial.id].sort())
  assert.equal(filteredData.suppliers, undefined, '缺少供应商读取权限时不得返回归档供应商')
  assert.deepEqual(filteredData.materials.map((item) => Object.keys(item).sort()), [
    ['code', 'deletedAt', 'id'], ['code', 'deletedAt', 'id'],
  ], '归档列表不得返回业务对象完整字段')
  assert.deepEqual((filteredData as any).modelActions.material, { canRestore: false, canPurge: false })
  assert.equal((await request(materialRead, `/api/deleted-records?model=supplier`)).status, 403)
  assert.equal((await request(materialRead, '/api/restore', {
    method: 'PATCH', body: JSON.stringify({ model: 'material', id: restoreMaterial.id }),
  })).status, 403, '恢复归档必须同时具有原业务更新权限')
  assert.equal((await request(materialRead, '/api/deleted-records', {
    method: 'DELETE', body: JSON.stringify({ model: 'material', id: purgeMaterial.id, confirmation: '永久删除' }),
  })).status, 403, '永久删除必须同时具有原业务归档权限')

  const materialManager = await login(`archive-material-manage-${suffix}`)
  const managerList = await request(materialManager, '/api/deleted-records?model=material')
  assert.equal(managerList.status, 200)
  assert.deepEqual((await managerList.json()).data.modelActions.material, { canRestore: true, canPurge: true })
  assert.equal((await request(materialManager, '/api/restore', {
    method: 'PATCH', body: JSON.stringify({ model: 'material', id: restoreMaterial.id }),
  })).status, 200)
  assert.equal((await request(materialManager, '/api/deleted-records', {
    method: 'DELETE', body: JSON.stringify({ model: 'material', id: purgeMaterial.id, confirmation: '永久删除' }),
  })).status, 200)

  const scopedReceipt = await login(`archive-receipt-scope-${suffix}`)
  const scopedList = await request(scopedReceipt, '/api/deleted-records?model=materialIn')
  assert.equal(scopedList.status, 200)
  const scopedData = (await scopedList.json()).data as Record<string, Array<{ id: string }>>
  assert.deepEqual(scopedData.materialIn.map((item) => item.id).sort(), [purgeReceipt.id, restoreReceipt.id].sort(), '归档列表只能返回账号库位范围内的来料单')
  assert.equal((await request(scopedReceipt, '/api/restore', {
    method: 'PATCH', body: JSON.stringify({ model: 'materialIn', id: blockedReceipt.id }),
  })).status, 403, '不得恢复账号库位范围外的来料单')
  assert.equal((await request(scopedReceipt, '/api/deleted-records', {
    method: 'DELETE', body: JSON.stringify({ model: 'materialIn', id: blockedReceipt.id, confirmation: '永久删除' }),
  })).status, 403, '不得永久删除账号库位范围外的来料单')
  assert.equal((await request(scopedReceipt, '/api/restore', {
    method: 'PATCH', body: JSON.stringify({ model: 'materialIn', id: restoreReceipt.id }),
  })).status, 200)
  assert.equal((await request(scopedReceipt, '/api/deleted-records', {
    method: 'DELETE', body: JSON.stringify({ model: 'materialIn', id: purgeReceipt.id, confirmation: '永久删除' }),
  })).status, 200)

  process.env.DATABASE_URL = databaseUrl
  const { prisma: verifiedPrisma } = await import('../lib/prisma')
  assert.equal((await verifiedPrisma.material.findUniqueOrThrow({ where: { id: restoreMaterial.id } })).deletedAt, null)
  assert.equal(await verifiedPrisma.material.count({ where: { id: purgeMaterial.id } }), 0)
  assert.equal((await verifiedPrisma.materialReceipt.findUniqueOrThrow({ where: { id: restoreReceipt.id } })).deletedAt, null)
  assert.equal(await verifiedPrisma.materialReceipt.count({ where: { id: purgeReceipt.id } }), 0)
  assert.ok((await verifiedPrisma.materialReceipt.findUniqueOrThrow({ where: { id: blockedReceipt.id } })).deletedAt)
  assert.ok(await verifiedPrisma.supplier.findUnique({ where: { id: hiddenSupplier.id } }))
  await verifiedPrisma.$disconnect()

  console.log('归档对象权限验证通过：入口权限、原业务权限和数据范围同时生效，列表过滤和越权动作 403 均符合预期。')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await stopServer(server)
  rmSync(verifyRoot, { recursive: true, force: true })
})
