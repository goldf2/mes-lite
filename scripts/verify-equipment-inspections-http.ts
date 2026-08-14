import assert from 'node:assert/strict'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-equipment-inspections-http-'))
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
  const [{ prisma }, { hashPassword }, { ensureDefaultPermissions }] = await Promise.all([import('../lib/prisma'), import('../lib/auth'), import('../lib/permissions')])
  await ensureDefaultPermissions()
  const groups = await prisma.permissionGroup.findMany({ where: { code: { in: ['base_access', 'equipment_maintenance'] } } })
  const groupByCode = new Map(groups.map((group) => [group.code, group.id]))
  const createOperator = (username: string, groupCode: 'base_access' | 'equipment_maintenance', productionMode: 'ALL' | 'WORK_CENTERS', workCenterId?: string) => prisma.operator.create({ data: {
    username, passwordHash: hashPassword('VerifyInspection123!'), name: username, role: 'OPERATOR', status: 'ACTIVE',
    permissionGroups: { create: [{ groupId: groupByCode.get(groupCode)! }] },
    dataScope: { create: { productionMode, inventoryMode: 'ALL', ...(workCenterId ? { workCenters: { create: { workCenterId } } } : {}) } },
  } })
  const [allowedCenter, blockedCenter] = await Promise.all([
    prisma.workCenter.create({ data: { code: 'EI-HTTP-A', name: '点检授权中心' } }), prisma.workCenter.create({ data: { code: 'EI-HTTP-B', name: '点检未授权中心' } }),
  ])
  const [allowedEquipment, blockedEquipment] = await Promise.all([
    prisma.equipment.create({ data: { code: 'EI-HTTP-EQ-A', name: '授权设备', equipmentType: '验证机', workCenterId: allowedCenter.id } }),
    prisma.equipment.create({ data: { code: 'EI-HTTP-EQ-B', name: '未授权设备', equipmentType: '验证机', workCenterId: blockedCenter.id } }),
  ])
  await Promise.all([
    createOperator('inspection-reader', 'base_access', 'ALL'),
    createOperator('inspection-maintainer', 'equipment_maintenance', 'WORK_CENTERS', allowedCenter.id),
  ])
  const dueAt = new Date(Date.now() - 60_000)
  const plan = await prisma.equipmentInspectionPlan.create({ data: { code: 'EI-HTTP-PLAN-A', name: '授权到期计划', equipmentId: allowedEquipment.id, intervalDays: 1, nextDueAt: dueAt, createdBy: 'HTTP 验证', items: { create: [{ name: '安全门', standard: '联锁有效', sortOrder: 1 }] } }, include: { items: true } })
  await prisma.equipmentInspectionPlan.create({ data: { code: 'EI-HTTP-PLAN-B', name: '未授权到期计划', equipmentId: blockedEquipment.id, intervalDays: 1, nextDueAt: dueAt, createdBy: 'HTTP 验证', items: { create: [{ name: '润滑', standard: '油位正常', sortOrder: 1 }] } } })
  await prisma.$disconnect()

  const port = await availablePort(); const baseUrl = `http://127.0.0.1:${port}`
  server = spawn(join(root, 'node_modules', '.bin', 'next'), ['dev', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
  await waitUntilReady(baseUrl, server)
  const login = async (username: string) => { const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl }, body: JSON.stringify({ username, password: 'VerifyInspection123!' }) }); assert.equal(response.status, 200); const cookie = response.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie); return cookie }
  const readerCookie = await login('inspection-reader')
  assert.equal((await fetch(`${baseUrl}/api/equipment-inspections`, { headers: { Cookie: readerCookie } })).status, 403, '无点检权限岗位读取任务必须返回 403')
  const maintainerCookie = await login('inspection-maintainer')
  const workspace = await fetch(`${baseUrl}/api/equipment-inspections?filter=DUE`, { headers: { Cookie: maintainerCookie } })
  assert.equal(workspace.status, 200)
  const workspacePayload = await workspace.json()
  assert.deepEqual(workspacePayload.data.plans.map((item: { code: string }) => item.code), ['EI-HTTP-PLAN-A'], '点检任务 API 必须按工作中心范围过滤')
  const complete = await fetch(`${baseUrl}/api/equipment-inspections/${plan.id}/complete`, { method: 'POST', headers: { Cookie: maintainerCookie, Origin: baseUrl, 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId: crypto.randomUUID(), inspectedAt: new Date().toISOString(), items: [{ planItemId: plan.items[0].id, result: 'PASS' }] }) })
  assert.equal(complete.status, 201, '设备维护岗位必须能完成授权范围内点检')
  const payload = await complete.json()
  assert.equal(payload.data.record.result, 'PASS')
  assert.equal((await fetch(`${baseUrl}/api/equipment-inspections/${plan.id}/complete`, { method: 'POST', headers: { Cookie: readerCookie, Origin: baseUrl, 'Content-Type': 'application/json' }, body: '{}' })).status, 403, '无点检权限岗位执行点检必须返回 403')
  console.log('设备点检 HTTP 验证通过：独立权限、工作中心范围、403 与完成命令均符合契约。')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => { await stopServer(server); rmSync(verifyRoot, { recursive: true, force: true }) })
