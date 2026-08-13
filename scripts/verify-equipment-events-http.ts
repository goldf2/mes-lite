import assert from 'node:assert/strict'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-equipment-http-'))
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
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return
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
  const [{ prisma }, { hashPassword }, { ensureDefaultPermissions }] = await Promise.all([
    import('../lib/prisma'), import('../lib/auth'), import('../lib/permissions'),
  ])
  await ensureDefaultPermissions()
  const groups = await prisma.permissionGroup.findMany({
    where: { code: { in: ['base_access', 'equipment_maintenance'] } },
  })
  const groupByCode = new Map(groups.map((group) => [group.code, group.id]))
  const createOperator = (username: string, jobCode: 'base_access' | 'equipment_maintenance') => prisma.operator.create({
    data: {
      username,
      passwordHash: hashPassword('VerifyEquipment123!'),
      name: username,
      role: 'OPERATOR',
      status: 'ACTIVE',
      permissionGroups: { create: [{ groupId: groupByCode.get(jobCode)! }] },
    },
  })
  await Promise.all([
    createOperator('verify-equipment-reader', 'base_access'),
    createOperator('verify-equipment-maintainer', 'equipment_maintenance'),
  ])
  const workCenter = await prisma.workCenter.create({ data: { code: 'EQ-HTTP-WC', name: '设备 HTTP 验证中心' } })
  const equipment = await prisma.equipment.create({
    data: { code: 'EQ-HTTP-01', name: '设备 HTTP 验证机', equipmentType: '验证机', workCenterId: workCenter.id },
  })
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
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl },
      body: JSON.stringify({ username, password: 'VerifyEquipment123!' }),
    })
    assert.equal(response.status, 200)
    const cookie = response.headers.get('set-cookie')?.split(';')[0]
    assert.ok(cookie)
    return cookie
  }
  const command = (cookie: string, body: unknown) => fetch(`${baseUrl}/api/equipment/${equipment.id}/events`, {
    method: 'POST', headers: { Cookie: cookie, Origin: baseUrl, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })

  const readerCookie = await login('verify-equipment-reader')
  assert.equal((await command(readerCookie, { action: 'START', reason: '越权启动' })).status, 403, '只读人员执行设备命令必须返回 403')

  const maintainerCookie = await login('verify-equipment-maintainer')
  const started = await command(maintainerCookie, { action: 'START', reason: '维护人员启动验证' })
  assert.equal(started.status, 201, '设备维护人员必须能执行事件命令')
  const payload = await started.json()
  assert.equal(payload.data.equipment.status, 'IN_USE')
  const timeline = await fetch(`${baseUrl}/api/equipment/${equipment.id}/events`, { headers: { Cookie: readerCookie } })
  assert.equal(timeline.status, 200, '设备只读权限必须能查看事件时间线')
  assert.equal((await timeline.json()).data[0].operatorName, 'verify-equipment-maintainer')

  console.log('设备事件 HTTP 权限验证通过：只读岗位命令返回 403，设备维护岗位可写事件，时间线对设备只读岗位开放。')
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1 })
  .finally(async () => {
    await stopServer(server)
    rmSync(verifyRoot, { recursive: true, force: true })
  })
