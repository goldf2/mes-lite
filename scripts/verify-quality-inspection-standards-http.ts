import assert from 'node:assert/strict'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-quality-standards-http-'))
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
  const groups = await prisma.permissionGroup.findMany({ where: { code: { in: ['quality_inspector', 'quality_disposition'] } } })
  const groupByCode = new Map(groups.map((group) => [group.code, group.id]))
  const material = await prisma.material.create({ data: { code: 'QS-HTTP-MAT', name: 'HTTP 检验标准物料', category: 'FINISHED', unit: '件' } })
  const createOperator = (username: string, groupCode: 'quality_inspector' | 'quality_disposition') => prisma.operator.create({ data: {
    username, passwordHash: hashPassword('VerifyQuality123!'), name: username, role: 'OPERATOR', status: 'ACTIVE',
    permissionGroups: { create: [{ groupId: groupByCode.get(groupCode)! }] },
    dataScope: { create: { productionMode: 'ALL', inventoryMode: 'ALL' } },
  } })
  await Promise.all([createOperator('quality-reader', 'quality_inspector'), createOperator('quality-engineer', 'quality_disposition')])
  await prisma.$disconnect()

  const port = await availablePort(); const baseUrl = `http://127.0.0.1:${port}`
  server = spawn(join(root, 'node_modules', '.bin', 'next'), ['dev', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
  await waitUntilReady(baseUrl, server)
  const login = async (username: string) => { const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl }, body: JSON.stringify({ username, password: 'VerifyQuality123!' }) }); assert.equal(response.status, 200); const cookie = response.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie); return cookie }
  const readerCookie = await login('quality-reader')
  const engineerCookie = await login('quality-engineer')
  const standardInput = {
    code: 'QS-HTTP-001', name: 'HTTP 出厂检验标准', materialId: material.id,
    sourceType: 'PRODUCTION_ORDER_ACTUAL_OUTPUT', samplingMode: 'FIXED', sampleValue: 2,
    minSampleQty: null, maxSampleQty: null, changeReason: 'HTTP 验证首次发布',
    items: [{ name: '外观', method: '目视检查', acceptanceCriteria: '无裂纹' }],
  }
  const denied = await fetch(`${baseUrl}/api/quality-inspection-standards`, { method: 'POST', headers: { Cookie: readerCookie, Origin: baseUrl, 'Content-Type': 'application/json' }, body: JSON.stringify(standardInput) })
  assert.equal(denied.status, 403, '质检员只有标准读取权，不得创建标准')
  const createdResponse = await fetch(`${baseUrl}/api/quality-inspection-standards`, { method: 'POST', headers: { Cookie: engineerCookie, Origin: baseUrl, 'Content-Type': 'application/json' }, body: JSON.stringify(standardInput) })
  assert.equal(createdResponse.status, 201)
  const created = (await createdResponse.json()).data
  const updatedResponse = await fetch(`${baseUrl}/api/quality-inspection-standards/${created.id}`, { method: 'PUT', headers: { Cookie: engineerCookie, Origin: baseUrl, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...standardInput, samplingMode: 'PERCENTAGE', sampleValue: 10, minSampleQty: 2, maxSampleQty: 10 }) })
  assert.equal(updatedResponse.status, 200)
  const releasedResponse = await fetch(`${baseUrl}/api/quality-inspection-standards/${created.id}/release`, { method: 'POST', headers: { Cookie: engineerCookie, Origin: baseUrl } })
  assert.equal(releasedResponse.status, 201)
  assert.equal((await releasedResponse.json()).data.status, 'RELEASED')
  const workspaceResponse = await fetch(`${baseUrl}/api/quality-inspection-standards`, { headers: { Cookie: readerCookie } })
  assert.equal(workspaceResponse.status, 200)
  assert.deepEqual((await workspaceResponse.json()).data.standards.map((item: { code: string }) => item.code), ['QS-HTTP-001'])
  const trendResponse = await fetch(`${baseUrl}/api/quality-inspections/trends`, { headers: { Cookie: readerCookie } })
  assert.equal(trendResponse.status, 200)
  assert.equal((await trendResponse.json()).data.summary.completedInspections, 0)
  console.log('质量检验标准 HTTP 验证通过：标准读写分权、草稿更新、发布和趋势读取均符合契约。')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => { await stopServer(server); rmSync(verifyRoot, { recursive: true, force: true }) })
