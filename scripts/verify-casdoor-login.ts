import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const directory = mkdtempSync(join(tmpdir(), 'mes-casdoor-'))
const previous = { ...process.env }
const databaseUrl = 'file:' + join(directory, 'test.db')
const issuer = 'https://identity.synthetic.test'
const clientId = 'synthetic-mes-client'
const checks: string[] = []
async function main() {
  process.env.DATABASE_URL = databaseUrl
  for (const key of ['APP_LOGIN_MODE', 'CASDOOR_ISSUER', 'CASDOOR_CLIENT_ID', 'CASDOOR_CLIENT_SECRET', 'CASDOOR_ORGANIZATION', 'CASDOOR_APPLICATION']) delete process.env[key]
  execFileSync(join(process.cwd(), 'node_modules/.bin/prisma'), ['migrate', 'deploy'], { env: { ...process.env, RUST_LOG: 'info' }, stdio: 'pipe' })
  const [{ prisma }, auth, login, policy, runtime, domain, service] = await Promise.all([
    import('../lib/prisma'), import('../lib/auth'),
    import('../modules/identity-access/server/casdoor-login-service'),
    import('../modules/identity-access/server/authentication-session-policy'),
    import('../modules/identity-access/server/authentication-runtime-service'),
    import('../modules/identity-access/domain/casdoor-runtime'),
    import('../modules/identity-access/server/authentication-service'),
  ])
  try {
    for (const role of ['ADMIN', 'OPERATOR']) await prisma.operator.create({ data: {
      id: 'fixture-' + role, username: 'fixture-' + role, name: 'Synthetic ' + role,
      passwordHash: auth.hashPassword('SyntheticFixturePassword123!'), role, status: 'ACTIVE',
    } })
    const normal = await service.loginWithPassword({ username: 'fixture-OPERATOR', password: 'SyntheticFixturePassword123!' })
    const findSession = (token: string) => prisma.operatorSession.findUniqueOrThrow({ where: { tokenHash: createHash('sha256').update(token).digest('hex') } })
    assert.equal(await policy.sessionAuthenticationAllowed(await findSession(normal.session.token), { role: 'OPERATOR', status: 'ACTIVE' }), true)
    checks.push('default-native-password-session')
    await prisma.operatorSession.create({ data: { id: 'legacy-session', tokenHash: 'legacy-hash', operatorId: 'fixture-OPERATOR', expiresAt: new Date(Date.now() + 60_000) } })
    assert.equal(await policy.sessionAuthenticationAllowed(await prisma.operatorSession.findUniqueOrThrow({ where: { id: 'legacy-session' } }), { role: 'OPERATOR', status: 'ACTIVE' }), true)
    checks.push('existing-native-session-compatible')
    Object.assign(process.env, { APP_LOGIN_MODE: 'casdoor', APP_ORIGIN: 'http://127.0.0.1:31981', CASDOOR_ISSUER: issuer,
      CASDOOR_CLIENT_ID: clientId, CASDOOR_CLIENT_SECRET: 'synthetic-client-secret', CASDOOR_ORGANIZATION: 'synthetic-org', CASDOOR_APPLICATION: 'synthetic-mes',
    })
    const first = await runtime.ensureAuthenticationRuntime()
    assert.equal(await prisma.operatorSession.count(), 0)
    await assert.rejects(service.loginWithPassword({ username: 'fixture-OPERATOR', password: 'SyntheticFixturePassword123!' }))
    checks.push('casdoor-disables-ordinary-password-and-old-native-sessions')
    const generations = await Promise.all(Array.from({ length: 12 }, () => runtime.ensureAuthenticationRuntime()))
    assert.equal(new Set(generations.map(value => value.state.generation)).size, 1)
    assert.equal(generations[0].state.generation, first.state.generation)
    checks.push('concurrent-runtime-reads-do-not-rotate')
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const wrongRsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const jwk = { ...rsa.publicKey.export({ format: 'jwk' }), kid: 'fixture-key', alg: 'RS256', use: 'sig' }
    type Scenario = { nonce: string; challenge: string; overrides?: Record<string, unknown>; wrongSignature?: boolean }
    const scenarios = new Map<string, Scenario>()
    let currentCode = '', tokenExchanges = 0
    let tokenBarrier: null | {entered: () => void; wait: Promise<void>} = null
    const metadata = { issuer, authorization_endpoint: issuer + '/authorize', token_endpoint: issuer + '/token', jwks_uri: issuer + '/jwks',
      response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'], code_challenge_methods_supported: ['S256'] }
    const network = {
      resolver: async () => [{ address: '203.0.113.10', family: 4 }],
      fetcher: async (url: string | URL | Request, init?: RequestInit) => {
        const pathname = new URL(url instanceof Request ? url.url : url).pathname
        if (pathname.endsWith('openid-configuration')) return Response.json(metadata)
        if (pathname === '/jwks') return Response.json({ keys: [jwk] })
        assert.equal(pathname, '/token')
        tokenExchanges++
        if (tokenBarrier) { const barrier = tokenBarrier; tokenBarrier = null; barrier.entered(); await barrier.wait }
        const body = new URLSearchParams(String(init?.body)), scenario = scenarios.get(body.get('code') || '')
        assert.ok(scenario)
        const challenge = createHash('sha256').update(body.get('code_verifier') || '').digest('base64url')
        if (challenge !== scenario.challenge) return Response.json({ error: 'invalid_grant' }, { status: 400 })
        const now = Math.floor(Date.now() / 1000)
        const payload = { iss: issuer, sub: 'synthetic-subject', aud: clientId, iat: now, exp: now + 300, nonce: scenario.nonce, ...scenario.overrides }
        const unsigned = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'fixture-key' })).toString('base64url') + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url')
        const jwt = unsigned + '.' + sign('RSA-SHA256', Buffer.from(unsigned), scenario.wrongSignature ? wrongRsa.privateKey : rsa.privateKey).toString('base64url')
        return Response.json({ access_token: 'fixture-access-token', token_type: 'Bearer', expires_in: 300, id_token: jwt })
      },
    }
    const begin = async (overrides?: Record<string, unknown>, wrongSignature = false) => {
      const pending = await login.beginCasdoorLogin('/?page=customers', network)
      const url = new URL(pending.authorizationUrl)
      currentCode = 'fixture-code-' + scenarios.size
      scenarios.set(currentCode, { nonce: url.searchParams.get('nonce')!, challenge: url.searchParams.get('code_challenge')!, overrides, wrongSignature })
      const callback = new URL(domain.MES_CASDOOR_CALLBACK, process.env.APP_ORIGIN)
      callback.searchParams.set('state', url.searchParams.get('state')!)
      callback.searchParams.set('code', currentCode)
      return { pending, callback }
    }
    const normalLogin = new URL((await login.beginCasdoorLogin('/', network)).authorizationUrl)
    assert.equal(normalLogin.searchParams.has('prompt'), false)
    assert.equal(normalLogin.searchParams.has('max_age'), false)
    checks.push('normal-sso-no-unsupported-reauthentication-parameters')
    let flow = await begin()
    const beforeUsers = await prisma.operator.count()
    await assert.rejects(login.completeCasdoorLogin(flow.callback.href, flow.pending.ticket, network), error => error instanceof domain.CasdoorLoginError && error.code === 'CASDOOR_BINDING_REQUIRED')
    assert.equal(await prisma.operator.count(), beforeUsers)
    assert.equal(await prisma.operatorSession.count(), 0)
    checks.push('verified-unbound-identity-never-creates-user-or-session')
    const binding = await prisma.operatorAuthAccount.create({ data: { provider: domain.casdoorProvider(issuer), providerUserId: 'synthetic-subject', operatorId: 'fixture-OPERATOR' } })
    flow = await begin()
    const loggedIn = await login.completeCasdoorLogin(flow.callback.href, flow.pending.ticket, network)
    assert.equal(loggedIn.operatorId, 'fixture-OPERATOR')
    assert.equal(loggedIn.next, '/?page=customers')
    const oidcSession = await findSession(loggedIn.session.token)
    assert.equal(await policy.sessionAuthenticationAllowed(oidcSession, { role: 'OPERATOR', status: 'ACTIVE' }), true)
    checks.push('signed-oidc-pkce-bound-operator-real-session')
    await assert.rejects(login.completeCasdoorLogin(flow.callback.href, flow.pending.ticket, network), /LOGIN_EXPIRED/)
    checks.push('challenge-replay-rejected')
    for (const [name, overrides, wrongSignature] of [
      ['nonce', { nonce: 'wrong-nonce' }, false], ['issuer', { iss: 'https://wrong.synthetic.test' }, false],
      ['audience', { aud: 'wrong-client' }, false], ['azp', { aud: [clientId, 'other'], azp: 'wrong-client' }, false],
      ['signature', {}, true],
    ] as const) {
      flow = await begin(overrides, wrongSignature)
      await assert.rejects(login.completeCasdoorLogin(flow.callback.href, flow.pending.ticket, network))
      checks.push('bad-' + name + '-rejected')
    }
    flow = await begin()
    flow.callback.searchParams.set('state', 'wrong-state')
    const exchangesBefore = tokenExchanges
    await assert.rejects(login.completeCasdoorLogin(flow.callback.href, flow.pending.ticket, network))
    assert.equal(tokenExchanges, exchangesBefore)
    checks.push('bad-state-before-token-exchange')
    flow = await begin()
    await prisma.operatorLoginChallenge.update({ where: { ticketHash: createHash('sha256').update(flow.pending.ticket).digest('hex') }, data: { verifier: 'wrong-verifier' } })
    await assert.rejects(login.completeCasdoorLogin(flow.callback.href, flow.pending.ticket, network))
    checks.push('bad-pkce-rejected-by-token-endpoint')
    flow = await begin()
    await prisma.operatorLoginChallenge.update({ where: { ticketHash: createHash('sha256').update(flow.pending.ticket).digest('hex') }, data: { expiresAt: new Date(0) } })
    await assert.rejects(login.completeCasdoorLogin(flow.callback.href, flow.pending.ticket, network), /LOGIN_EXPIRED/)
    checks.push('expired-challenge-rejected')
    await prisma.operatorAuthAccount.delete({ where: { id: binding.id } })
    assert.equal(await policy.sessionAuthenticationAllowed(oidcSession, { role: 'OPERATOR', status: 'ACTIVE' }), false)
    checks.push('binding-revocation-immediate')
    await prisma.operatorAuthAccount.create({ data: { id: binding.id, provider: domain.casdoorProvider(issuer), providerUserId: 'synthetic-subject', operatorId: 'fixture-OPERATOR' } })
    assert.equal(await policy.sessionAuthenticationAllowed(oidcSession, { role: 'OPERATOR', status: 'DISABLED' }), false)
    checks.push('disabled-operator-rejected')
    for (const key of ['CASDOOR_CLIENT_ID', 'CASDOOR_ORGANIZATION', 'CASDOOR_CLIENT_SECRET']) {
      const original = process.env[key]!
      process.env[key] = original + '-changed'
      await runtime.ensureAuthenticationRuntime()
      process.env[key] = original
      const restored = await runtime.ensureAuthenticationRuntime()
      assert.notEqual(restored.state.generation, oidcSession.authGeneration)
      assert.equal(await policy.sessionAuthenticationAllowed(oidcSession, { role: 'OPERATOR', status: 'ACTIVE' }), false)
      checks.push(key.toLowerCase() + '-a-b-a-does-not-revive')
    }
    process.env.APP_LOGIN_MODE = 'builtin'
    await runtime.ensureAuthenticationRuntime()
    process.env.APP_LOGIN_MODE = 'casdoor'
    await runtime.ensureAuthenticationRuntime()
    assert.equal(await policy.sessionAuthenticationAllowed(oidcSession, { role: 'OPERATOR', status: 'ACTIVE' }), false)
    assert.equal(await prisma.operatorSession.findUnique({ where: { id: 'legacy-session' } }), null)
    checks.push('mode-a-b-a-does-not-revive-native-or-oidc')
    await assert.rejects(service.loginWithPassword({ username: 'fixture-OPERATOR', password: 'SyntheticFixturePassword123!' }, new Date(), { administratorRecovery: true }))
    const recovered = await service.loginWithPassword({ username: 'fixture-ADMIN', password: 'SyntheticFixturePassword123!' }, new Date(), { administratorRecovery: true })
    const recoverySession = await findSession(recovered.session.token)
    assert.equal(await policy.sessionAuthenticationAllowed(recoverySession, { role: 'ADMIN', status: 'ACTIVE' }), true)
    assert.equal(await policy.sessionAuthenticationAllowed(recoverySession, { role: 'OPERATOR', status: 'ACTIVE' }), false)
    assert.equal(await policy.sessionAuthenticationAllowed(recoverySession, { role: 'ADMIN', status: 'DISABLED' }), false)
    checks.push('existing-admin-recovery-no-role-grant-and-live-role-status-checks')
    await service.revokeOperatorSession(recovered.session.token)
    assert.equal(await prisma.operatorSession.findUnique({ where: { id: recoverySession.id } }), null)
    checks.push('normal-logout-revokes-session')
    delete process.env.CASDOOR_CLIENT_SECRET
    assert.equal(domain.readLoginConfiguration().ready, false)
    await assert.rejects(login.beginCasdoorLogin('/', network), /CASDOOR_UNAVAILABLE/)
    checks.push('explicit-missing-configuration-fails-closed')
    for (const unsafe of ['//evil.test', 'https://evil.test', '/\\evil.test', '/api/auth/casdoor/login']) assert.equal(domain.safeLoginReturn(unsafe), '/')
    checks.push('external-return-targets-rejected')
    process.env.CASDOOR_CLIENT_SECRET = 'synthetic-client-secret'
    const { verifyCasdoorHttpBoundary } = await import('./casdoor-login-http-fixture')
    checks.push(...await verifyCasdoorHttpBoundary(prisma, async () => {
      const current = await begin()
      return { ...await login.completeCasdoorLogin(current.callback.href, current.pending.ticket, network), ticket: current.pending.ticket }
    }, async () => {
      const current = await begin()
      let entered!: () => void, release!: () => void
      const hasEntered = new Promise<void>(resolve => { entered = resolve })
      const wait = new Promise<void>(resolve => { release = resolve })
      tokenBarrier = { entered, wait }
      const completion = login.completeCasdoorLogin(current.callback.href, current.pending.ticket, network)
      void completion.catch(() => {})
      await hasEntered
      return { ticket: current.pending.ticket, completion, release }
    }))
    const { verifyAuthenticationReadinessHttp } = await import('./casdoor-login-http-fixture')
    checks.push(...await verifyAuthenticationReadinessHttp())
    console.log(JSON.stringify({ result: 'passed', checks: checks.length, cases: checks, node: process.version, productionWrites: 0, externalNetworkCalls: 0, loopbackHttpChecks: checks.filter(value => value.startsWith('http-')).length, protocol: 'real RS256 tokens and public shared OIDC helper; synthetic identity transport and real local Next HTTP, temporary migrated Prisma DB; RP form/callback tested locally, provider not contacted' }))
  } finally {
    await prisma.$disconnect()
    for (const key of Array.from(new Set([...Object.keys(previous), ...Object.keys(process.env)]))) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]
    }
    rmSync(directory, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
