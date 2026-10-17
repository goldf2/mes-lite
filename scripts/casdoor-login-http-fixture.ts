import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { PrismaClient } from '@prisma/client'
import { CASDOOR_HINT_COOKIES, sealCasdoorLogoutHint } from '../modules/identity-access/server/casdoor-logout-service'

async function availablePort() {
  return new Promise<number>((resolve, reject) => {
    const listener = createServer(); listener.once('error', reject)
    listener.listen(0, '127.0.0.1', () => {
      const address = listener.address()
      listener.close(error => error ? reject(error) : resolve(typeof address === 'object' && address ? address.port : 0))
    })
  })
}
export async function verifyCasdoorHttpBoundary(prisma: PrismaClient,
  createOidcSession: () => Promise<{ session: { token: string; expiresAt: Date }; ticket: string; idToken: string; authGeneration: string }>,
  suspendOidcCallback: () => Promise<{ ticket: string; completion: Promise<unknown>; release: () => void }>,
) {
  const checks: string[] = [], port = await availablePort(), origin = 'http://127.0.0.1:' + port
  process.env.APP_ORIGIN = origin
  const login = await createOidcSession()
  const cookie = 'mes_lite_session=' + login.session.token
  await prisma.permissionSetting.upsert({ where: { role_resource: { role: 'OPERATOR', resource: 'customers' } }, create: { role: 'OPERATOR', resource: 'customers', canRead: true }, update: { canRead: true } })
  await prisma.customer.create({ data: { id: 'fixture-http-customer', code: 'HTTP-CASDOOR', name: 'Synthetic HTTP customer' } })
  let server: ChildProcess | null = null
  try {
    server = spawn(process.execPath, [join(process.cwd(), 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1' }, detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    server.stdout?.resume(); server.stderr?.resume()
    let ready = false
    for (let attempt = 0; attempt < 120; attempt++) {
      if (server.exitCode !== null) throw new Error('FIXTURE_SERVER_EXITED')
      try { if ((await fetch(origin + '/api/health')).ok) { ready = true; break } } catch { /* bounded local startup */ }
      await delay(500)
    }
    assert.equal(ready, true)
    const readiness = await fetch(origin + '/api/health/ready')
    assert.equal(readiness.status, 200)
    assert.equal((await readiness.json()).checks.authentication.status, 'pass')
    checks.push('http-actual-docker-readiness-includes-authentication')
    assert.equal((await fetch(origin + '/api/customers')).status, 401)
    checks.push('http-private-api-without-cookie-401')
    let response = await fetch(origin + '/api/auth/me', { headers: { Cookie: cookie } })
    assert.equal((await response.json()).data?.id, 'fixture-OPERATOR')
    response = await fetch(origin + '/api/customers', { headers: { Cookie: cookie } })
    assert.equal(response.status, 200)
    assert.ok((await response.text()).includes('fixture-http-customer'))
    checks.push('http-normal-oidc-session-current-operator-and-business-read')
    assert.equal((await fetch(origin + '/api/system/login-settings', { headers: { Cookie: cookie } })).status, 403)
    checks.push('http-ordinary-user-login-settings-403')
    const post = (path: string, username: string, requestOrigin = origin) => fetch(origin + path, {
      method: 'POST', headers: { Origin: requestOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'SyntheticFixturePassword123!' }),
    })
    assert.equal((await post('/api/auth/native-admin/login', 'fixture-ADMIN', 'https://outside.synthetic.test')).status, 403)
    response = await post('/api/auth/native-admin/login', 'fixture-OPERATOR')
    assert.equal(response.status, 403); assert.equal(response.headers.get('set-cookie'), null)
    checks.push('http-recovery-origin-and-non-admin-denied')
    response = await post('/api/auth/native-admin/login', 'fixture-ADMIN')
    assert.equal(response.status, 200)
    const adminCookie = response.headers.get('set-cookie')?.split(';')[0]
    assert.ok(adminCookie)
    response = await fetch(origin + '/api/system/login-settings', { headers: { Cookie: adminCookie } })
    assert.equal(response.status, 200)
    const diagnostic = await response.text()
    assert.ok(diagnostic.includes('explicit-existing-active-operator'))
    assert.ok(!diagnostic.includes('synthetic-client-secret'))
    checks.push('http-existing-admin-recovery-and-secret-free-diagnostics')
    const inflight = await suspendOidcCallback()
    try {
      response = await fetch(origin + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie + '; mes_lite_casdoor_challenge=' + inflight.ticket, Origin: origin } })
      assert.equal(response.status, 200)
      assert.ok(response.headers.get('set-cookie')?.includes('mes_lite_casdoor_challenge='))
      assert.equal((await response.json()).providerLogoutIssuer, process.env.CASDOOR_ISSUER)
      inflight.release()
      await assert.rejects(inflight.completion, /LOGIN_EXPIRED/)
      assert.equal((await fetch(origin + '/api/system/login-settings', { headers: { Cookie: cookie } })).status, 401)
      assert.equal((await fetch(origin + '/api/customers', { headers: { Cookie: cookie } })).status, 403)
      checks.push('http-logout-during-token-exchange-rejects-inflight-callback')
    } finally { inflight.release() }
    const callbackBeforeLogout = await createOidcSession()
    const otherAttempt = await prisma.operatorLoginChallenge.create({ data: { ticketHash: 'unrelated-browser-challenge', verifier: 'fixture', state: 'fixture', nonce: 'fixture', generation: 'fixture', returnPath: '/', expiresAt: new Date(Date.now() + 60_000) } })
    response = await fetch(origin + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie + '; mes_lite_casdoor_challenge=' + callbackBeforeLogout.ticket, Origin: origin } })
    assert.equal(response.status, 200)
    assert.equal((await fetch(origin + '/api/system/login-settings', { headers: { Cookie: 'mes_lite_session=' + callbackBeforeLogout.session.token } })).status, 401)
    assert.ok(await prisma.operatorLoginChallenge.findUnique({ where: { ticketHash: otherAttempt.ticketHash } }))
    checks.push('http-logout-revokes-completed-linked-callback-without-other-browser')
    response = await fetch(origin + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie, Origin: origin } })
    assert.equal(response.status, 200)
    assert.ok(response.headers.get('set-cookie')?.includes('Max-Age=0'))
    assert.equal((await fetch(origin + '/api/system/login-settings', { headers: { Cookie: cookie } })).status, 401)
    assert.equal((await fetch(origin + '/api/customers')).status, 401)
    checks.push('http-logout-clears-cookie-and-old-session-private-401')
    const rp = await createOidcSession(), operatorCount = await prisma.operator.count(), customerCount = await prisma.customer.count()
    const logoutConfig = {origin, issuer: process.env.CASDOOR_ISSUER!, clientId: process.env.CASDOOR_CLIENT_ID!, clientSecret: process.env.CASDOOR_CLIENT_SECRET!, generation: rp.authGeneration}
    const hintParts = sealCasdoorLogoutHint(logoutConfig, rp.idToken, rp.session.token, rp.session.expiresAt)
    const jar = new Map<string,string>([['mes_lite_session',rp.session.token], ...hintParts.map((value,index):[string,string]=>[CASDOOR_HINT_COOKIES[index],value])])
    const jarHeader = () => Array.from(jar.entries()).map(([key,value])=>key+'='+value).join('; ')
    const receiveCookies = (result: Response) => {
      for (const header of result.headers.getSetCookie()) {
        const pair=header.split(';')[0], separator=pair.indexOf('='), key=pair.slice(0,separator), value=pair.slice(separator+1)
        if (!value || /Max-Age=0/i.test(header)) jar.delete(key); else jar.set(key,value)
      }
    }
    response = await fetch(origin+'/api/auth/logout',{method:'POST',headers:{Cookie:jarHeader(),Origin:origin}})
    assert.equal(response.status,200)
    const logoutPayload=await response.json();assert.equal(logoutPayload.handoffUrl,'/api/auth/casdoor/logout');assert.equal(logoutPayload.providerLogoutIssuer,null)
    assert.ok(!JSON.stringify(logoutPayload).includes(rp.idToken));receiveCookies(response)
    assert.equal(jar.has('mes_lite_session'),false);assert.ok(!Array.from(jar.keys()).some(name=>CASDOOR_HINT_COOKIES.includes(name as typeof CASDOOR_HINT_COOKIES[number])))
    assert.equal((await fetch(origin+'/api/customers',{headers:{Cookie:jarHeader()}})).status,401)
    assert.equal((await (await fetch(origin+'/api/auth/me',{headers:{Cookie:'mes_lite_session='+rp.session.token}})).json()).data,null)
    assert.equal((await fetch(origin+'/api/system/login-settings',{headers:{Cookie:'mes_lite_session='+rp.session.token}})).status,401)
    checks.push('http-rp-local-revoked-before-private-sealed-handoff-no-token-json')
    const wrongTarget=await fetch(origin+'/api/auth/casdoor/logout?next=https://outside.synthetic.test',{headers:{Cookie:jarHeader()}})
    assert.equal(wrongTarget.status,409)
    checks.push('http-rp-handoff-rejects-caller-controlled-query')
    response = await fetch(origin+'/api/auth/casdoor/logout',{headers:{Cookie:jarHeader()}})
    assert.equal(response.status,200);assert.match(response.headers.get('content-security-policy')||'',/default-src 'none'/)
    assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal(response.headers.get('cache-control'),'no-store')
    const form=await response.text();assert.ok(form.includes('method="post"'));assert.ok(form.includes('name="id_token_hint" value="'+rp.idToken+'"'))
    assert.ok(form.includes('name="post_logout_redirect_uri" value="'+origin+'/api/auth/casdoor/logout/callback"'))
    const state=/name="state" value="([A-Za-z0-9_-]{43})"/.exec(form)?.[1];assert.ok(state);receiveCookies(response)
    assert.ok(!Array.from(jar.keys()).some(name=>name.startsWith('mes_lite_oidc_logout_')&&name!=='mes_lite_oidc_logout_state'))
    checks.push('http-rp-consumes-browser-handoff-and-returns-fixed-form-post-csp')
    response=await fetch(origin+'/api/auth/casdoor/logout/callback?state=wrong',{headers:{Cookie:jarHeader()},redirect:'manual'})
    assert.equal(response.status,409)
    checks.push('http-rp-callback-rejects-wrong-state')
    response=await fetch(origin+'/api/auth/casdoor/logout/callback?state='+state,{headers:{Cookie:jarHeader()},redirect:'manual'})
    assert.equal(response.status,307);assert.equal(response.headers.get('location'),origin+'/?casdoor_login=PROVIDER_LOGOUT_COMPLETE');receiveCookies(response)
    assert.equal((await fetch(origin+'/api/auth/casdoor/logout/callback?state='+state,{headers:{Cookie:jarHeader()},redirect:'manual'})).status,409)
    checks.push('http-rp-exact-callback-clears-state-no-auto-login-browser-replay-denied')
    assert.equal(await prisma.operator.count(),operatorCount);assert.equal(await prisma.customer.count(),customerCount)
    assert.equal((await fetch(origin+'/api/customers',{headers:{Cookie:jarHeader()}})).status,401)
    checks.push('http-rp-no-account-business-write-and-private-api-stays-401')
    await prisma.operator.update({ where: { id: 'fixture-ADMIN' }, data: { role: 'OPERATOR' } })
    assert.equal((await fetch(origin + '/api/system/login-settings', { headers: { Cookie: adminCookie } })).status, 401)
    await prisma.operator.update({ where: { id: 'fixture-ADMIN' }, data: { role: 'ADMIN' } })
    assert.equal((await fetch(origin + '/api/system/login-settings', { headers: { Cookie: adminCookie } })).status, 401)
    checks.push('http-recovery-role-revoked-session-cannot-revive')
    response = await post('/api/auth/native-admin/login', 'fixture-ADMIN')
    const freshRecoveryCookie = response.headers.get('set-cookie')?.split(';')[0]
    assert.ok(freshRecoveryCookie)
    response = await fetch(origin + '/api/auth/logout', {method:'POST',headers:{Cookie:freshRecoveryCookie!,Origin:origin}})
    assert.equal(response.status, 200)
    assert.equal((await response.json()).providerLogoutIssuer, null)
    checks.push('http-native-admin-recovery-does-not-sign-out-provider')
    return checks
  } finally {
    if (server?.pid) {
      try { process.kill(-server.pid, 'SIGTERM') } catch { /* already stopped */ }
      for (let attempt = 0; attempt < 20 && server.exitCode === null; attempt++) await delay(100)
      if (server.exitCode === null) { try { process.kill(-server.pid, 'SIGKILL') } catch { /* already stopped */ } }
    }
  }
}

/** Run the actual Docker readiness route for missing Casdoor config and default builtin, each in an isolated dev process. */
export async function verifyAuthenticationReadinessHttp() {
  const checks: string[] = []
  for (const mode of ['casdoor', 'builtin']) {
    const port = await availablePort(), origin = 'http://127.0.0.1:' + port
    const env: NodeJS.ProcessEnv = { ...process.env, APP_LOGIN_MODE: mode, APP_ORIGIN: origin, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1' }
    delete env.CASDOOR_CLIENT_SECRET
    const server = spawn(process.execPath, [join(process.cwd(), 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: process.cwd(), env, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    server.stdout?.resume(); server.stderr?.resume()
    try {
      let started = false
      for (let attempt = 0; attempt < 120; attempt++) {
        if (server.exitCode !== null) throw new Error('READINESS_FIXTURE_SERVER_EXITED')
        try { const response = await fetch(origin + '/api/auth/method'); if ([200, 503].includes(response.status)) { started = true; break } } catch { /* bounded startup */ }
        await delay(500)
      }
      assert.equal(started, true)
      const response = await fetch(origin + '/api/health/ready'), payload = await response.json()
      assert.equal(response.status, mode === 'casdoor' ? 503 : 200)
      assert.equal(payload.checks.authentication.status, mode === 'casdoor' ? 'fail' : 'pass')
      const method = await fetch(origin + '/api/auth/method'), result = await method.json()
      assert.equal(result.data.mode, mode); assert.equal(result.data.ready, mode === 'builtin')
      checks.push('http-actual-readiness-' + mode + (mode === 'casdoor' ? '-missing-config-503' : '-compatible-200'))
    } finally {
      if (server.pid) {
        try { process.kill(-server.pid, 'SIGTERM') } catch { /* stopped */ }
        for (let attempt = 0; attempt < 20 && server.exitCode === null; attempt++) await delay(100)
        if (server.exitCode === null) { try { process.kill(-server.pid, 'SIGKILL') } catch { /* stopped */ } }
      }
    }
  }
  return checks
}
