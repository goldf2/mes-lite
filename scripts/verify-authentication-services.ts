import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  initialAdministratorInputSchema,
  loginInputSchema,
  registerInputSchema,
} from '../modules/identity-access/contracts/authentication'
import {
  AuthenticationError,
  operatorLoginStatusError,
  publicRegistrationEnabled,
  weChatUsernameBase,
} from '../modules/identity-access/domain/authentication'
import { authenticationClientKeyFromHeaders } from '../modules/identity-access/http/authentication-request'
import {
  isTrustedWriteRequestOrigin,
  resolveRequestOrigin,
} from '../modules/identity-access/domain/request-origin-policy'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

for (const path of [
  'app/api/auth/login/route.ts', 'app/api/auth/register/route.ts',
  'app/api/auth/logout/route.ts', 'app/api/auth/setup/route.ts',
  'app/api/auth/wechat/callback/route.ts',
]) {
  const source = read(path)
  assert.doesNotMatch(source, /@\/lib\/prisma|\bprisma\.|\$transaction/, `${path} 不得直接访问数据库`)
  assert.ok(source.split('\n').length <= 60, `${path} 必须保持为不超过 60 行的身份 HTTP 适配层`)
}

const authenticationService = read('modules/identity-access/server/authentication-service.ts')
assert.doesNotMatch(authenticationService, /isFirstOperator|operator\.count\(\) === 0/, '公开注册或微信登录不得自动创建管理员')
assert.match(authenticationService, /installInitialAdministrator/, '必须提供显式的首位管理员安装服务')
assert.match(read('app/api/auth/register/route.ts'), /publicRegistrationEnabled/, '公开注册必须由服务端开关控制')
assert.match(read('app/api/auth/register/route.ts'), /dynamic = 'force-dynamic'/, '公开注册状态必须在运行时读取且不得静态缓存')
assert.match(read('app/api/auth/login/route.ts'), /enforceAuthenticationRequestLimit/, '登录入口必须执行持久化请求限流')
assert.match(read('app/api/auth/setup/route.ts'), /enforceAuthenticationRequestLimit/, '管理员安装入口必须执行持久化请求限流')
assert.match(authenticationService, /action: 'SYSTEM_SETUP'/, '管理员安装事务必须写入操作记录')
assert.match(read('app/api/auth/wechat/login/route.ts'), /enforceAuthenticationRequestLimit/, '微信登录入口必须执行持久化请求限流')
assert.match(read('app/api/auth/wechat/login/route.ts'), /dynamic = 'force-dynamic'/, '微信限流入口必须禁用静态预渲染')
assert.match(read('app/api/auth/wechat/status/route.ts'), /dynamic = 'force-dynamic'/, '微信配置状态必须在运行时读取且不得静态缓存')
assert.match(read('middleware.ts'), /isTrustedWriteRequestOrigin/, 'Middleware 必须校验写请求 Origin')
assert.match(read('lib/auth.ts'), /secure:\s*process\.env\.NODE_ENV === 'production'/, '生产会话 Cookie 必须显式启用 Secure')

assert.equal(registerInputSchema.safeParse({ username: 'a', password: '123', name: '' }).success, false)
assert.equal(registerInputSchema.safeParse({ username: 'worker', password: '1234567890', name: '操作员' }).success, true)
assert.equal(initialAdministratorInputSchema.safeParse({ username: 'admin', password: 'too-short', name: '管理员' }).success, false)
assert.equal(loginInputSchema.safeParse({ username: 'admin', password: 'secret' }).success, true)
assert.match(operatorLoginStatusError('PENDING')?.message || '', /待审核/)
assert.equal(operatorLoginStatusError('ACTIVE'), null)
assert.equal(weChatUsernameBase('o!pen@id-123', 'fallback'), 'wx_openid123')

const previousRegistrationSetting = process.env.MES_PUBLIC_REGISTRATION_ENABLED
delete process.env.MES_PUBLIC_REGISTRATION_ENABLED
assert.equal(publicRegistrationEnabled(), false, '公开注册必须默认关闭')
process.env.MES_PUBLIC_REGISTRATION_ENABLED = 'true'
assert.equal(publicRegistrationEnabled(), true)
if (previousRegistrationSetting === undefined) delete process.env.MES_PUBLIC_REGISTRATION_ENABLED
else process.env.MES_PUBLIC_REGISTRATION_ENABLED = previousRegistrationSetting

assert.equal(isTrustedWriteRequestOrigin({ method: 'GET', requestOrigin: 'https://mes.example.com', origin: null }), true)
assert.equal(isTrustedWriteRequestOrigin({ method: 'POST', requestOrigin: 'https://mes.example.com', origin: 'https://mes.example.com' }), true)
assert.equal(isTrustedWriteRequestOrigin({ method: 'POST', requestOrigin: 'https://mes.example.com', origin: 'https://evil.example.com' }), false)
assert.equal(isTrustedWriteRequestOrigin({ method: 'POST', requestOrigin: 'https://mes.example.com', origin: null }), false)
assert.equal(resolveRequestOrigin({
  fallbackOrigin: 'http://mes-lite:3000',
  forwardedHost: 'mes.example.com',
  forwardedProto: 'https',
}), 'https://mes.example.com')
assert.equal(authenticationClientKeyFromHeaders(new Headers({
  'x-forwarded-for': 'spoofed-address, 192.0.2.10',
})), '192.0.2.10', '限流不得信任可由客户端前置伪造的首个 forwarded 地址')

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-authentication-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl
process.env.MES_INITIAL_ADMIN_TOKEN = 'verify-admin-token-that-is-at-least-32-characters'

async function rejectedAuthentication(
  operation: () => Promise<unknown>,
  status: AuthenticationError['status'],
) {
  await assert.rejects(operation, (error: unknown) => error instanceof AuthenticationError && error.status === status)
}

async function main() {
  const [{ NextRequest }, { middleware }] = await Promise.all([
    import('next/server'),
    import('../middleware'),
  ])
  assert.equal(middleware(new NextRequest('https://mes.example.com/api/auth/login', {
    method: 'POST', headers: { origin: 'https://evil.example.com' },
  })).status, 403)
  assert.equal(middleware(new NextRequest('https://mes.example.com/api/auth/login', {
    method: 'POST', headers: { origin: 'https://mes.example.com' },
  })).status, 200)
  assert.equal(middleware(new NextRequest('https://mes.example.com/api/auth/login', {
    method: 'POST',
  })).status, 403)

  const [
    { prisma },
    {
      installInitialAdministrator,
      loginWithPassword,
      registerOperator,
      resolveWeChatOperator,
      revokeOperatorSession,
    },
    { consumeAuthenticationThrottle },
    { updateOperatorAdministration },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/identity-access/server/authentication-service'),
    import('../modules/identity-access/server/authentication-throttle-service'),
    import('../modules/identity-access/server/operator-admin-service'),
  ])
  try {
    const admin = await installInitialAdministrator(
      initialAdministratorInputSchema.parse({ username: 'admin', password: 'verify-secret-123', name: '管理员' }),
      process.env.MES_INITIAL_ADMIN_TOKEN,
    )
    assert.deepEqual([admin.role, admin.status], ['ADMIN', 'ACTIVE'])
    assert.equal(await prisma.auditLog.count({
      where: { action: 'SYSTEM_SETUP', entityType: 'OPERATOR', entityId: admin.id },
    }), 1)
    await rejectedAuthentication(
      () => installInitialAdministrator(
        initialAdministratorInputSchema.parse({ username: 'second-admin', password: 'verify-secret-456', name: '第二管理员' }),
        process.env.MES_INITIAL_ADMIN_TOKEN,
      ),
      409,
    )

    const registrationAuditContext = {
      operatorId: undefined, operatorName: '公开注册访客', ipAddress: '192.0.2.20', userAgent: 'verify-agent',
    }
    const registered = await registerOperator(registerInputSchema.parse({
      username: 'worker', password: 'worker-secret', name: '操作员',
    }), registrationAuditContext)
    assert.deepEqual([registered.role, registered.status], ['OPERATOR', 'PENDING'])
    assert.deepEqual(await prisma.operatorDataScope.findUnique({
      where: { operatorId: registered.id },
      select: { productionMode: true, inventoryMode: true },
    }), { productionMode: 'SELF', inventoryMode: 'LOCATIONS' })
    await rejectedAuthentication(
      () => registerOperator(registerInputSchema.parse({ username: 'worker', password: 'worker-secret', name: '重复' })),
      400,
    )
    await rejectedAuthentication(() => loginWithPassword({ username: 'worker', password: 'worker-secret' }), 403)
    assert.equal(await prisma.auditLog.count({
      where: { action: 'REGISTER', entityType: 'OPERATOR', entityId: registered.id },
    }), 1, '公开注册必须与待审批账号在同一事务记录审计')

    const administrationAuditContext = {
      operatorId: admin.id, operatorName: admin.name, ipAddress: undefined, userAgent: undefined,
    }
    const activated = await updateOperatorAdministration(
      { id: admin.id, role: admin.role },
      { id: registered.id, status: 'ACTIVE' },
      administrationAuditContext,
    )
    assert.equal(activated.status, 'ACTIVE')
    const administrationAudit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'UPDATE', entityType: 'OPERATOR', entityId: registered.id },
    })
    assert.ok(administrationAudit.beforeData && administrationAudit.afterData, '人员状态审计必须保留前后快照')

    const firstFailureAt = new Date('2026-08-12T08:00:00.000Z')
    for (let attempt = 1; attempt < 5; attempt += 1) {
      await rejectedAuthentication(() => loginWithPassword({ username: 'admin', password: 'wrong-password' }, firstFailureAt), 401)
    }
    await rejectedAuthentication(() => loginWithPassword({ username: 'admin', password: 'wrong-password' }, firstFailureAt), 429)
    await rejectedAuthentication(
      () => loginWithPassword({ username: 'admin', password: 'verify-secret-123' }, new Date('2026-08-12T08:10:00.000Z')),
      429,
    )
    const locked = await prisma.operator.findUniqueOrThrow({ where: { id: admin.id } })
    assert.equal(locked.failedLoginAttempts, 5)
    assert.ok(locked.lockedUntil && locked.lockedUntil > firstFailureAt)

    const login = await loginWithPassword(
      { username: 'admin', password: 'verify-secret-123' },
      new Date('2026-08-12T08:16:00.000Z'),
    )
    assert.equal(login.operator.username, 'admin')
    const unlocked = await prisma.operator.findUniqueOrThrow({ where: { id: admin.id } })
    assert.deepEqual([unlocked.failedLoginAttempts, unlocked.lockedUntil, unlocked.lastFailedLoginAt], [0, null, null])
    assert.equal(await prisma.operatorSession.count({ where: { operatorId: admin.id } }), 1)
    await revokeOperatorSession(login.session.token)
    assert.equal(await prisma.operatorSession.count({ where: { operatorId: admin.id } }), 0)

    const throttleInput = {
      scope: 'VERIFY', clientKey: '192.0.2.10', limit: 3, windowMs: 60_000, blockMs: 120_000,
      now: new Date('2026-08-12T09:00:00.000Z'),
    }
    await consumeAuthenticationThrottle(throttleInput)
    await consumeAuthenticationThrottle(throttleInput)
    await consumeAuthenticationThrottle(throttleInput)
    await rejectedAuthentication(() => consumeAuthenticationThrottle(throttleInput), 429)
    await consumeAuthenticationThrottle({ ...throttleInput, clientKey: '192.0.2.11' })
    await consumeAuthenticationThrottle({ ...throttleInput, now: new Date('2026-08-12T09:02:01.000Z') })

    const wechat = await resolveWeChatOperator({ openid: 'openid-verify', nickname: '微信验证员', rawData: { safe: true } })
    assert.deepEqual([wechat.operator.role, wechat.operator.status], ['OPERATOR', 'PENDING'])
    assert.deepEqual(await prisma.operatorDataScope.findUnique({
      where: { operatorId: wechat.operator.id },
      select: { productionMode: true, inventoryMode: true },
    }), { productionMode: 'SELF', inventoryMode: 'LOCATIONS' })
    assert.equal((await resolveWeChatOperator({ openid: 'openid-verify', nickname: '更新昵称' })).operator.id, wechat.operator.id)
    assert.equal(await prisma.operatorAuthAccount.count(), 1)
    console.log('身份认证服务验证通过：显式管理员安装、默认关闭注册、登录锁定、请求限流、同源校验、安全 Cookie 与微信待审均通过。')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  rmSync(verifyRoot, { recursive: true, force: true })
  process.exit(1)
})
