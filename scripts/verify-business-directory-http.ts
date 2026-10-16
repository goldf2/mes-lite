import assert from 'node:assert/strict'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-directory-http-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
const fixtureKey = 'directory-http-fixture-only-not-a-production-secret'
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

async function main() {
  execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
    cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
  })
  process.env.DATABASE_URL = databaseUrl
  const [{ prisma }, { hashPassword }, { ensureDefaultPermissions }] = await Promise.all([
    import('../lib/prisma'), import('../lib/auth'), import('../lib/permissions'),
  ])
  try {
    await ensureDefaultPermissions()
    await prisma.operator.createMany({ data: [
      { id: 'http-directory-admin', username: 'http-directory-admin', name: 'HTTP验证管理员', passwordHash: hashPassword('DirectoryFixture123!'), role: 'ADMIN', status: 'ACTIVE' },
      { id: 'http-directory-reader', username: 'http-directory-reader', name: 'HTTP验证人员', passwordHash: hashPassword('DirectoryFixture123!'), role: 'OPERATOR', status: 'ACTIVE' },
    ] })
    await prisma.permissionSetting.update({ where: { role_resource: { role: 'OPERATOR', resource: 'customers' } }, data: { canRead: true } })
    await prisma.permissionSetting.update({ where: { role_resource: { role: 'OPERATOR', resource: 'businessSettings' } }, data: { canRead: true } })
    await prisma.customer.create({ data: { id: 'http-directory-customer', code: 'HTTP-DIR', name: 'HTTP验证企业', contact: '验证联系人', address: '验证地址' } })
    const port = await availablePort()
    const baseUrl = `http://127.0.0.1:${port}`
    server = spawn(join(root, 'node_modules', '.bin', 'next'), ['dev', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: root,
      env: {
        ...process.env, NODE_ENV: 'development', DATABASE_URL: databaseUrl, NEXT_TELEMETRY_DISABLED: '1',
        BUSINESS_DIRECTORY_ENABLED: 'true', BUSINESS_DIRECTORY_API_KEY_SHA256: createHash('sha256').update(fixtureKey).digest('hex'),
        BUSINESS_DIRECTORY_OPERATOR_ID: 'http-directory-reader', BUSINESS_DIRECTORY_INSTANCE_ID: 'http-instance',
        BUSINESS_DIRECTORY_TENANT_ID: 'http-enterprise', BUSINESS_DIRECTORY_WORKSPACE_ID: 'http-workspace', BUSINESS_DIRECTORY_EXPIRES_AT: '2099-01-01T00:00:00Z',
      }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    server.stdout?.resume()
    server.stderr?.resume()
    const deadline = Date.now() + 60_000
    let ready = false
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error('本机目录 HTTP 验证服务已退出')
      try { if ((await fetch(`${baseUrl}/api/health`)).ok) { ready = true; break } } catch { /* bounded startup wait */ }
      await delay(300)
    }
    assert.equal(ready, true, '本机目录 HTTP 验证服务应在60秒内就绪')
    const login = async (username: string) => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ username, password: 'DirectoryFixture123!' }),
      })
      assert.equal(response.status, 200)
      const cookie = response.headers.get('set-cookie')?.split(';')[0]
      assert.ok(cookie)
      return cookie
    }
    const admin = await login('http-directory-admin')
    const reader = await login('http-directory-reader')
    const diagnosticsUrl = `${baseUrl}/api/system/business-directory`
    assert.equal((await fetch(diagnosticsUrl)).status, 401)
    assert.equal((await fetch(diagnosticsUrl, { headers: { Cookie: reader } })).status, 403, '普通用户即有businessSettings.read也不能读配置诊断')
    const diagnostics = await fetch(diagnosticsUrl, { headers: { Cookie: admin } })
    assert.equal(diagnostics.status, 200)
    const text = await diagnostics.text()
    assert.equal(text.includes(fixtureKey), false)
    assert.equal(text.includes(createHash('sha256').update(fixtureKey).digest('hex')), false)
    const payload = JSON.parse(text)
    assert.equal(payload.data.ready, true)
    assert.equal(payload.data.expiresAt, '2099-01-01T00:00:00Z')
    const directoryUrl = `${baseUrl}/api/integrations/business-directory/v1/contacts`
    assert.equal((await fetch(directoryUrl, { headers: { Cookie: admin } })).status, 401, '真实管理员会话不能替代API凭据')
    const response = await fetch(directoryUrl, { headers: { Authorization: `Bearer ${fixtureKey}` } })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).records[0].enterpriseName, 'HTTP验证企业')
    assert.equal((await fetch(directoryUrl, { method: 'POST', headers: { Authorization: `Bearer ${fixtureKey}` } })).status, 405)
    await prisma.permissionSetting.update({ where: { role_resource: { role: 'OPERATOR', resource: 'customers' } }, data: { canRead: false } })
    assert.equal((await fetch(directoryUrl, { headers: { Authorization: `Bearer ${fixtureKey}`, Cookie: admin } })).status, 403, '撤权后真实HTTP请求即时拒绝，管理员Cookie不能救回委托')
    console.log('业务目录 HTTP 验证通过：隔离Next服务正常登录、管理员诊断/普通人员拒绝、摘要不暴露、独立Bearer及即时撤权。')
  } finally { await prisma.$disconnect() }
}

main().finally(async () => {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await Promise.race([new Promise<void>((resolve) => server!.once('exit', () => resolve())), delay(3000).then(() => { if (server?.exitCode === null) server.kill('SIGKILL') })])
  }
  rmSync(verifyRoot, { recursive: true, force: true })
}).catch((error) => { console.error(error); process.exitCode = 1 })
