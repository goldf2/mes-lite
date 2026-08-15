import assert from 'node:assert/strict'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-incoming-quality-http-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
let server: ChildProcess | null = null

async function availablePort() {
  return new Promise<number>((resolve, reject) => { const listener = createServer(); listener.once('error', reject); listener.listen(0, '127.0.0.1', () => { const address = listener.address(); listener.close((error) => error ? reject(error) : resolve(typeof address === 'object' && address ? address.port : 0)) }) })
}
async function waitUntilReady(baseUrl: string, process: ChildProcess) {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) { if (process.exitCode !== null) throw new Error(`Next.js 验证服务已退出：${process.exitCode}`); try { if ((await fetch(`${baseUrl}/api/health`)).ok) return } catch { /* 等待编译 */ } await delay(300) }
  throw new Error('Next.js 验证服务启动超时')
}
async function stopServer(process: ChildProcess | null) {
  if (!process || process.exitCode !== null) return
  process.kill('SIGTERM')
  await Promise.race([new Promise<void>((resolve) => process.once('exit', () => resolve())), delay(3_000).then(() => { if (process.exitCode === null) process.kill('SIGKILL') })])
}

async function main() {
  execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe' })
  process.env.DATABASE_URL = databaseUrl
  const [
    { prisma }, { hashPassword }, { ensureDefaultPermissions },
    { createMaterialIns }, { createMaterialInSchema }, standards,
  ] = await Promise.all([
    import('../lib/prisma'), import('../lib/auth'), import('../lib/permissions'),
    import('../modules/receiving/server/material-in-service'), import('../modules/receiving/contracts/material-in-schema'),
    import('../modules/quality/server/quality-inspection-standard-service'),
  ])
  await ensureDefaultPermissions()
  const groups = await prisma.permissionGroup.findMany({ where: { code: { in: ['warehouse_executor', 'warehouse_lead', 'quality_inspector'] } } })
  const groupByCode = new Map(groups.map((group) => [group.code, group.id]))
  const [supplier, location, blockedLocation, material] = await Promise.all([
    prisma.supplier.create({ data: { code: 'IQ-HTTP-SUP', name: '来料质检 HTTP 供应商' } }),
    prisma.inventoryLocation.create({ data: { code: 'IQ-HTTP-LOC', name: '来料质检 HTTP 授权库位', isDefault: true } }),
    prisma.inventoryLocation.create({ data: { code: 'IQ-HTTP-BLOCK', name: '来料质检 HTTP 未授权库位' } }),
    prisma.material.create({ data: { code: 'IQ-HTTP-MAT', name: '来料质检 HTTP 原料', category: 'RAW', unit: 'kg', stockUnit: 'kg', valuationUnit: 'kg', costingMethod: 'FIFO' } }),
  ])
  const standard = await standards.createQualityInspectionStandard({
    code: 'IQ-HTTP-STD', name: 'HTTP 来料检验标准', materialId: material.id,
    sourceType: 'MATERIAL_IN', samplingMode: 'FIXED', sampleValue: 2, minSampleQty: null, maxSampleQty: null,
    changeReason: 'HTTP 角色交接验证', items: [{ name: '外观', method: '目视检查', acceptanceCriteria: '无严重锈蚀' }],
  }, { operatorName: '质量工程师', auditContext: { operatorId: 'iq-http-engineer', operatorName: '质量工程师', ipAddress: undefined, userAgent: undefined } })
  await standards.releaseQualityInspectionStandard(standard.id, { operatorName: '质量工程师', auditContext: { operatorId: 'iq-http-engineer', operatorName: '质量工程师', ipAddress: undefined, userAgent: undefined } })
  const receipt = await createMaterialIns(createMaterialInSchema.parse({
    supplierId: supplier.id, stagingLocationId: location.id, receivedBy: 'HTTP 仓管员',
    materialId: material.id, qty: 8, valuationQty: 8, unitPrice: 5, priceUnit: 'kg', priceBasis: 'STOCK', batchNo: 'IQ-HTTP-HEAT',
  }))
  const editorOnlyGroup = await prisma.permissionGroup.create({ data: {
    code: 'incoming_editor_only', name: '仅编辑来料',
    settings: { create: { resource: 'materialIn', canRead: true, canCreate: true, canUpdate: true, canDelete: false, canGrant: false } },
  } })
  const createOperator = (username: string, groupId: string, scopeLocationId: string) => prisma.operator.create({ data: {
    username, passwordHash: hashPassword('VerifyIncoming123!'), name: username, role: 'OPERATOR', status: 'ACTIVE',
    permissionGroups: { create: [{ groupId }] },
    dataScope: { create: { productionMode: 'ALL', inventoryMode: 'LOCATIONS', locations: { create: [{ locationId: scopeLocationId }] } } },
  } })
  await Promise.all([
    createOperator('incoming-editor', editorOnlyGroup.id, location.id),
    createOperator('incoming-warehouse', groupByCode.get('warehouse_executor')!, location.id),
    createOperator('incoming-warehouse-lead', groupByCode.get('warehouse_lead')!, location.id),
    createOperator('incoming-inspector', groupByCode.get('quality_inspector')!, location.id),
    createOperator('incoming-outsider', groupByCode.get('quality_inspector')!, blockedLocation.id),
  ])
  await prisma.$disconnect()

  const port = await availablePort(); const baseUrl = `http://127.0.0.1:${port}`
  server = spawn(join(root, 'node_modules', '.bin', 'next'), ['dev', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
  await waitUntilReady(baseUrl, server)
  const login = async (username: string) => {
    const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl }, body: JSON.stringify({ username, password: 'VerifyIncoming123!' }) })
    const body = await response.clone().json().catch(() => null)
    assert.equal(response.status, 200, `${username} 并发登录失败：${JSON.stringify(body)}`)
    const cookie = response.headers.get('set-cookie')?.split(';')[0]
    assert.ok(cookie)
    return cookie
  }
  const [editorCookie, warehouseCookie, warehouseLeadCookie, inspectorCookie, outsiderCookie] = await Promise.all([
    login('incoming-editor'), login('incoming-warehouse'), login('incoming-warehouse-lead'), login('incoming-inspector'), login('incoming-outsider'),
  ])
  const deniedReceive = await fetch(`${baseUrl}/api/material-ins/${receipt.first.id}/receive`, { method: 'PATCH', headers: { Cookie: editorCookie, Origin: baseUrl } })
  assert.equal(deniedReceive.status, 403, '仅有来料通用更新权限的账号不得确认收货')
  const deniedReject = await fetch(`${baseUrl}/api/material-ins/${receipt.first.id}/reject`, { method: 'PATCH', headers: { Cookie: editorCookie, Origin: baseUrl } })
  assert.equal(deniedReject.status, 403, '仅有来料通用更新权限的账号不得拒收')
  const receivedResponse = await fetch(`${baseUrl}/api/material-ins/${receipt.first.id}/receive`, { method: 'PATCH', headers: { Cookie: warehouseCookie, Origin: baseUrl } })
  assert.equal(receivedResponse.status, 200, '授权仓管员必须能确认收货')
  const receivedBody = await receivedResponse.json()
  assert.equal(receivedBody.data.qualityInspectionsCreated, 1)
  assert.match(receivedBody.message, /1 个来料检验任务/)
  assert.equal((await fetch(`${baseUrl}/api/quality-inspections?filter=PENDING`, { headers: { Cookie: warehouseCookie } })).status, 403, '仓管组不得读取质量任务')

  const workspaceResponse = await fetch(`${baseUrl}/api/quality-inspections?filter=PENDING`, { headers: { Cookie: inspectorCookie } })
  assert.equal(workspaceResponse.status, 200)
  const workspace = await workspaceResponse.json()
  assert.equal(workspace.items.length, 1)
  const inspection = workspace.items[0]
  assert.equal(inspection.sourceType, 'MATERIAL_IN')
  assert.equal(inspection.sourceId, receipt.items[0].id)
  assert.equal(inspection.lot.balances[0].inventoryStatus, 'QUARANTINE')
  const outsiderWorkspace = await fetch(`${baseUrl}/api/quality-inspections?filter=PENDING`, { headers: { Cookie: outsiderCookie } })
  assert.equal(outsiderWorkspace.status, 200)
  assert.equal((await outsiderWorkspace.json()).items.length, 0, '未授权库位的质检员不得看到来料任务')

  const decisionInput = {
    decision: 'PASS', sampleQty: 2, goodQty: 2, badQty: 0, note: 'HTTP 来料检验合格',
    itemResults: inspection.checkItems.map((item: { id: string }) => ({ itemId: item.id, result: 'PASS', measuredValue: '符合', note: null })),
  }
  const warehouseDecision = await fetch(`${baseUrl}/api/quality-inspections/${inspection.id}/decision`, { method: 'PATCH', headers: { Cookie: warehouseCookie, Origin: baseUrl, 'Content-Type': 'application/json' }, body: JSON.stringify(decisionInput) })
  assert.equal(warehouseDecision.status, 403, '仓管员不得执行质量判定')
  const outsiderDecision = await fetch(`${baseUrl}/api/quality-inspections/${inspection.id}/decision`, { method: 'PATCH', headers: { Cookie: outsiderCookie, Origin: baseUrl, 'Content-Type': 'application/json' }, body: JSON.stringify(decisionInput) })
  assert.equal(outsiderDecision.status, 403, '质检员不得判定授权库位之外的任务')
  const inspectorDecision = await fetch(`${baseUrl}/api/quality-inspections/${inspection.id}/decision`, { method: 'PATCH', headers: { Cookie: inspectorCookie, Origin: baseUrl, 'Content-Type': 'application/json' }, body: JSON.stringify(decisionInput) })
  assert.equal(inspectorDecision.status, 200, '授权质检员必须能完成来料检验')
  assert.equal((await inspectorDecision.json()).data.result, 'PASS')
  const deniedReverse = await fetch(`${baseUrl}/api/material-ins/${receipt.first.id}/reverse`, { method: 'PATCH', headers: { Cookie: warehouseCookie, Origin: baseUrl, 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: '普通仓管越权红冲' }) })
  assert.equal(deniedReverse.status, 403, '普通仓管员不得执行来料红冲')
  const editorDeniedReverse = await fetch(`${baseUrl}/api/material-ins/${receipt.first.id}/reverse`, { method: 'PATCH', headers: { Cookie: editorCookie, Origin: baseUrl, 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: '编辑账号越权红冲' }) })
  assert.equal(editorDeniedReverse.status, 403, '仅有来料通用更新权限的账号不得执行红冲')
  const leadReverse = await fetch(`${baseUrl}/api/material-ins/${receipt.first.id}/reverse`, { method: 'PATCH', headers: { Cookie: warehouseLeadCookie, Origin: baseUrl, 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: '主管复核后红冲' }) })
  assert.equal(leadReverse.status, 200, '仓库主管必须能执行有原因的来料红冲')
  console.log('来料自动检验 HTTP 验证通过：编辑/收货/红冲命令分权、质量任务交接、库位范围和质检放行均符合契约。')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => { await stopServer(server); rmSync(verifyRoot, { recursive: true, force: true }) })
