import assert from 'node:assert/strict'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-data-scope-http-'))
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
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return } catch { /* wait */ }
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
  const [wcA, wcB] = await Promise.all([
    prisma.workCenter.create({ data: { code: `HTTP-WC-A-${suffix}`, name: 'HTTP 一车间' } }),
    prisma.workCenter.create({ data: { code: `HTTP-WC-B-${suffix}`, name: 'HTTP 二车间' } }),
  ])
  const [locA, locB] = await Promise.all([
    prisma.inventoryLocation.create({ data: { code: `HTTP-L-A-${suffix}`, name: 'HTTP 一号库', isDefault: true } }),
    prisma.inventoryLocation.create({ data: { code: `HTTP-L-B-${suffix}`, name: 'HTTP 二号库' } }),
  ])
  const [employeeA, employeeB] = await Promise.all([
    prisma.employee.create({ data: { code: `HTTP-E-A-${suffix}`, name: 'HTTP 员工甲' } }),
    prisma.employee.create({ data: { code: `HTTP-E-B-${suffix}`, name: 'HTTP 员工乙' } }),
  ])
  const operator = await prisma.operator.create({ data: {
    username: `scope-http-${suffix}`, passwordHash: hashPassword('VerifyScope123!'), name: '范围 HTTP 账号', role: 'OPERATOR', status: 'ACTIVE',
    employee: { connect: { id: employeeA.id } },
    dataScope: { create: {
      productionMode: 'SELF', inventoryMode: 'LOCATIONS', locations: { create: { locationId: locA.id } },
    } },
    permissionGroups: { create: { group: { create: {
      code: `scope-http-${suffix}`, name: '范围 HTTP 组', settings: { create: [
        { resource: 'dispatch', canRead: true, canCreate: true, canUpdate: true },
        { resource: 'stocks', canRead: true, canUpdate: true },
        { resource: 'flowTransfers', canRead: true, canCreate: true, canUpdate: true },
        { resource: 'orders', canRead: true },
        { resource: 'stats', canRead: true },
      ] },
    } } } },
  } })
  const material = await prisma.material.create({ data: { code: `HTTP-M-${suffix}`, name: 'HTTP 物料', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件' } })
  const product = await prisma.product.create({ data: { sku: `HTTP-M-${suffix}`, name: material.name, category: 'FINISHED', unit: '件', materialId: material.id } })
  const route = await prisma.processRoute.create({ data: {
    productId: product.id, materialId: material.id, name: 'HTTP 路线', isDefault: true,
    steps: { create: [
      { stepNo: 10, name: '本人工序', workstation: wcA.name, workCenterId: wcA.id },
      { stepNo: 20, name: '他人工序', workstation: wcB.name, workCenterId: wcB.id },
    ] },
  }, include: { steps: true } })
  const order = await prisma.productionOrder.create({ data: { orderNo: `HTTP-PO-${suffix}`, productId: product.id, materialId: material.id, planQty: 10, status: 'RELEASED' } })
  const [ownDispatch, otherDispatch] = await Promise.all([
    prisma.dispatch.create({ data: { dispatchNo: `HTTP-DP-A-${suffix}`, orderId: order.id, stepId: route.steps[0].id, employeeId: employeeA.id, workerName: employeeA.name, workerId: employeeA.code, planQty: 5 } }),
    prisma.dispatch.create({ data: { dispatchNo: `HTTP-DP-B-${suffix}`, orderId: order.id, stepId: route.steps[1].id, employeeId: employeeB.id, workerName: employeeB.name, workerId: employeeB.code, planQty: 5 } }),
  ])
  await prisma.workReport.createMany({ data: [
    { orderId: order.id, stepId: route.steps[0].id, workerName: employeeA.name, workerId: employeeA.code, startTime: new Date(), endTime: new Date(), goodQty: 7, badQty: 1 },
    { orderId: order.id, stepId: route.steps[1].id, workerName: employeeB.name, workerId: employeeB.code, startTime: new Date(), endTime: new Date(), goodQty: 11, badQty: 2 },
  ] })
  await prisma.stock.create({ data: {
    materialId: material.id, qty: 30, availableQty: 30, valuationQty: 30, availableValuationQty: 30, totalCost: 300,
    locationBalances: { create: [{ locationId: locA.id, qty: 10, availableQty: 10 }, { locationId: locB.id, qty: 20, availableQty: 20 }] },
  } })
  await prisma.$disconnect()

  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  server = spawn(join(root, 'node_modules', '.bin', 'next'), ['dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  await waitUntilReady(baseUrl, server)
  const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl }, body: JSON.stringify({ username: operator.username, password: 'VerifyScope123!' }) })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie')!.split(';')[0]
  const request = (path: string, init: RequestInit = {}) => fetch(`${baseUrl}${path}`, { ...init, headers: { Cookie: cookie, Origin: baseUrl, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } })

  const listResponse = await request('/api/dispatches')
  assert.equal(listResponse.status, 200)
  const dispatches = (await listResponse.json()).data as Array<{ id: string }>
  assert.deepEqual(dispatches.map((item) => item.id), [ownDispatch.id])
  assert.equal((await request(`/api/dispatches/${otherDispatch.id}`)).status, 403)
  assert.equal((await request(`/api/dispatches/${otherDispatch.id}/dispatch`, { method: 'PATCH' })).status, 403)
  const employeeResponse = await request('/api/dispatches?options=employees')
  assert.deepEqual(((await employeeResponse.json()).data as Array<{ id: string }>).map((item) => item.id), [employeeA.id])

  const stockResponse = await request('/api/stocks')
  assert.equal(stockResponse.status, 200)
  const stock = (await stockResponse.json()).data[0]
  assert.equal(stock.qty, 10)
  assert.equal(stock.totalCost, 0)
  assert.equal(stock.dataScopeRestricted, true)
  const locationResponse = await request('/api/inventory-locations?context=stocks')
  assert.deepEqual(((await locationResponse.json()).data as Array<{ id: string }>).map((item) => item.id), [locA.id])
  const illegalTransfer = await request('/api/flow-transfers', { method: 'POST', body: JSON.stringify({
    transferDate: '2026-08-13', materialId: material.id, sourceLocationId: locA.id, targetLocationId: locB.id,
    quantity: 1, employeeId: employeeA.id,
  }) })
  assert.equal(illegalTransfer.status, 403)

  const productionStats = await request('/api/stats/production?groupBy=worker')
  assert.equal(productionStats.status, 200)
  assert.deepEqual((await productionStats.json()).data, [
    { workerName: employeeA.name, goodQty: 7, badQty: 1, reportCount: 1 },
  ])
  const qualityStats = await request('/api/stats/quality')
  assert.equal(qualityStats.status, 200)
  const quality = (await qualityStats.json()).data
  assert.deepEqual([quality.totalGood, quality.totalBad, quality.byOrder.length], [7, 1, 1])

  console.log('数据范围 HTTP 验证通过：列表、详情、状态命令、员工/库位候选、库存/统计汇总与跨库位写入均由服务端限制，越权返回 403。')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await stopServer(server)
  rmSync(verifyRoot, { recursive: true, force: true })
})
