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
  const [{ prisma }, { hashPassword }, { ensureDefaultPermissions }] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/auth'),
    import('../lib/permissions'),
  ])
  await ensureDefaultPermissions()
  const groups = await prisma.permissionGroup.findMany({ where: { code: { in: ['base_access', 'production_executor', 'production_lead', 'production_planner'] } } })
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
  ])
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

  console.log('生产命令 HTTP 权限验证通过：操作工与计划员越权发布、确认或冲销均返回 403，生产主管命令通过门禁。')
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
