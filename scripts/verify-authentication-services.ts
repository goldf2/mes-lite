import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loginInputSchema, registerInputSchema } from '../modules/identity-access/contracts/authentication'
import { AuthenticationError, operatorLoginStatusError, weChatUsernameBase } from '../modules/identity-access/domain/authentication'

const root = process.cwd()
for (const path of [
  'app/api/auth/login/route.ts', 'app/api/auth/register/route.ts',
  'app/api/auth/logout/route.ts', 'app/api/auth/wechat/callback/route.ts',
]) {
  const source = readFileSync(join(root, path), 'utf8')
  assert.doesNotMatch(source, /@\/lib\/prisma|\bprisma\.|\$transaction/, `${path} 不得直接访问数据库`)
  assert.ok(source.split('\n').length <= 60, `${path} 必须保持为不超过 60 行的身份 HTTP 适配层`)
}
assert.equal(registerInputSchema.safeParse({ username: 'a', password: '123', name: '' }).success, false)
assert.equal(loginInputSchema.safeParse({ username: 'admin', password: 'secret' }).success, true)
assert.match(operatorLoginStatusError('PENDING')?.message || '', /待审核/)
assert.equal(operatorLoginStatusError('ACTIVE'), null)
assert.equal(weChatUsernameBase('o!pen@id-123', 'fallback'), 'wx_openid123')

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-authentication-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

async function main() {
  const [
    { prisma },
    { loginWithPassword, registerOperator, resolveWeChatOperator, revokeOperatorSession },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/identity-access/server/authentication-service'),
  ])
  try {
    const first = await registerOperator(registerInputSchema.parse({ username: 'admin', password: 'secret1', name: '管理员' }))
    assert.deepEqual([first.isFirstOperator, first.operator.role, first.operator.status], [true, 'ADMIN', 'ACTIVE'])
    const second = await registerOperator(registerInputSchema.parse({ username: 'worker', password: 'secret2', name: '操作员' }))
    assert.deepEqual([second.isFirstOperator, second.operator.role, second.operator.status], [false, 'OPERATOR', 'PENDING'])
    await assert.rejects(() => registerOperator(registerInputSchema.parse({ username: 'worker', password: 'secret2', name: '重复' })), AuthenticationError)
    await assert.rejects(() => loginWithPassword({ username: 'worker', password: 'secret2' }), AuthenticationError)
    const login = await loginWithPassword({ username: 'admin', password: 'secret1' })
    assert.equal(login.operator.username, 'admin')
    assert.equal(await prisma.operatorSession.count({ where: { operatorId: first.operator.id } }), 1)
    await revokeOperatorSession(login.session.token)
    assert.equal(await prisma.operatorSession.count({ where: { operatorId: first.operator.id } }), 0)

    const wechat = await resolveWeChatOperator({ openid: 'openid-verify', nickname: '微信验证员', rawData: { safe: true } })
    assert.equal(wechat.operator.status, 'PENDING')
    assert.equal((await resolveWeChatOperator({ openid: 'openid-verify', nickname: '更新昵称' })).operator.id, wechat.operator.id)
    assert.equal(await prisma.operatorAuthAccount.count(), 1)
    console.log('身份认证服务验证通过：首位管理员、待审注册、密码登录/注销和微信账号幂等绑定均通过临时数据库回归。')
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
