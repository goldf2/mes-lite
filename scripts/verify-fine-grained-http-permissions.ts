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

  console.log('细粒度 HTTP 权限验证通过：供应商、AI、统计、流程转移、BOM 与 BOM 成本均相互隔离，越权返回 403。')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await stopServer(server)
  rmSync(verifyRoot, { recursive: true, force: true })
})
