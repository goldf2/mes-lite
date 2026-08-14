import assert from 'node:assert/strict'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-equipment-maintenance-http-'))
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
  const [allowedCenter, blockedCenter] = await Promise.all([
    prisma.workCenter.create({ data: { code: 'EM-HTTP-A', name: '维保 HTTP 授权中心' } }),
    prisma.workCenter.create({ data: { code: 'EM-HTTP-B', name: '维保 HTTP 未授权中心' } }),
  ])
  const [equipment, blockedEquipment] = await Promise.all([
    prisma.equipment.create({ data: { code: 'EM-HTTP-EQ-A', name: '授权维保设备', equipmentType: '验证机', workCenterId: allowedCenter.id } }),
    prisma.equipment.create({ data: { code: 'EM-HTTP-EQ-B', name: '未授权维保设备', equipmentType: '验证机', workCenterId: blockedCenter.id } }),
  ])
  const dueAt = new Date(Date.now() - 60_000)
  const plan = await prisma.equipmentMaintenancePlan.create({
    data: { code: 'EM-HTTP-PLAN-A', name: '授权到期保养', equipmentId: equipment.id, intervalDays: 30, nextDueAt: dueAt, createdBy: 'HTTP 验证', items: { create: [{ name: '润滑', standard: '更换润滑滤芯', sortOrder: 1 }] } },
    include: { items: true },
  })
  await prisma.equipmentMaintenancePlan.create({ data: { code: 'EM-HTTP-PLAN-B', name: '未授权到期保养', equipmentId: blockedEquipment.id, intervalDays: 30, nextDueAt: dueAt, createdBy: 'HTTP 验证', items: { create: [{ name: '紧固', standard: '按扭矩紧固', sortOrder: 1 }] } } })
  const createOperator = (username: string, groupCode: 'base_access' | 'equipment_maintenance', productionMode: 'ALL' | 'WORK_CENTERS', workCenterId?: string) => prisma.operator.create({ data: {
    username, passwordHash: hashPassword('VerifyMaintenance123!'), name: username, role: 'OPERATOR', status: 'ACTIVE',
    permissionGroups: { create: [{ groupId: groupByCode.get(groupCode)! }] },
    dataScope: { create: { productionMode, inventoryMode: 'ALL', ...(workCenterId ? { workCenters: { create: { workCenterId } } } : {}) } },
  } })
  await Promise.all([createOperator('maintenance-reader', 'base_access', 'ALL'), createOperator('maintenance-worker', 'equipment_maintenance', 'WORK_CENTERS', allowedCenter.id)])
  await prisma.$disconnect()

  const port = await availablePort(); const baseUrl = `http://127.0.0.1:${port}`
  server = spawn(join(root, 'node_modules', '.bin', 'next'), ['dev', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
  await waitUntilReady(baseUrl, server)
  const login = async (username: string) => { const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl }, body: JSON.stringify({ username, password: 'VerifyMaintenance123!' }) }); assert.equal(response.status, 200); const cookie = response.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie); return cookie }
  const readerCookie = await login('maintenance-reader')
  assert.equal((await fetch(`${baseUrl}/api/equipment-maintenance`, { headers: { Cookie: readerCookie } })).status, 403, '无维保权限岗位读取任务必须返回 403')
  const workerCookie = await login('maintenance-worker')
  const workspaceResponse = await fetch(`${baseUrl}/api/equipment-maintenance?filter=DUE`, { headers: { Cookie: workerCookie } })
  assert.equal(workspaceResponse.status, 200)
  const workspace = await workspaceResponse.json()
  assert.deepEqual(workspace.data.plans.map((item: { code: string }) => item.code), ['EM-HTTP-PLAN-A'], '维保任务 API 必须按工作中心范围过滤')
  const generated = await fetch(`${baseUrl}/api/equipment-maintenance/plans/${plan.id}/work-orders`, { method: 'POST', headers: { Cookie: workerCookie, Origin: baseUrl, 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId: crypto.randomUUID(), assignedTo: '设备组' }) })
  assert.equal(generated.status, 201, '设备维护岗位必须能生成授权范围内保养工单')
  const workOrder = (await generated.json()).data.workOrder
  assert.equal((await fetch(`${baseUrl}/api/equipment-maintenance/work-orders/${workOrder.id}/start`, { method: 'POST', headers: { Cookie: workerCookie, Origin: baseUrl } })).status, 201, '设备维护岗位必须能开始工单')
  const completed = await fetch(`${baseUrl}/api/equipment-maintenance/work-orders/${workOrder.id}/complete`, { method: 'POST', headers: { Cookie: workerCookie, Origin: baseUrl, 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId: crypto.randomUUID(), completedAt: new Date().toISOString(), workDescription: '完成润滑保养并试机', failureCause: null, items: [{ planItemId: plan.items[0].id, result: 'PASS', note: null }], spares: [] }) })
  assert.equal(completed.status, 201, '设备维护岗位必须能完成授权范围内工单')
  assert.equal((await completed.json()).data.workOrder.status, 'COMPLETED')
  const blockedCreate = await fetch(`${baseUrl}/api/equipment-maintenance/work-orders`, { method: 'POST', headers: { Cookie: workerCookie, Origin: baseUrl, 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId: crypto.randomUUID(), equipmentId: blockedEquipment.id, title: '越权维修', priority: 'HIGH', faultDescription: '越权故障', assignedTo: null, dueAt: null }) })
  assert.equal(blockedCreate.status, 403, '工作中心范围外的维修工单创建必须返回 403')
  console.log('设备维保 HTTP 验证通过：独立权限、工作中心范围、403 与工单生成/开始/完成命令均符合契约。')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => { await stopServer(server); rmSync(verifyRoot, { recursive: true, force: true }) })
