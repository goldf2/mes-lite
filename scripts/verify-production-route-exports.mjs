import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const nativeRequire = createRequire(import.meta.url)
const routes = [
  { pathname: '/api/auth/method', methods: ['GET'] },
  { pathname: '/api/system/login-settings', methods: ['GET'] },
  { pathname: '/api/auth/native-admin/login', methods: ['POST'] },
  { pathname: '/api/auth/casdoor/login', methods: ['GET'] },
  { pathname: '/api/auth/casdoor/callback', methods: ['GET'] },
  { pathname: '/api/health', methods: ['GET'] },
  { pathname: '/api/auth/login', methods: ['POST'] },
  { pathname: '/api/warehouse-packages', methods: ['GET', 'POST'] },
]

async function verifyRoute(routeModule, { pathname, methods }) {
  assert.ok(routeModule?.userland, `${pathname}: missing built routeModule.userland`)
  for (const method of methods) {
    assert.equal(typeof routeModule.userland[method], 'function', `${pathname}: built ${method} export missing (would return framework 405)`)
    assert.equal(routeModule.methods?.[method], routeModule.userland[method], `${pathname}: ${method} is not bound to the userland handler`)
  }
  const response = await routeModule.methods.OPTIONS()
  assert.equal(response.status, 204, `${pathname}: automatic OPTIONS should return 204`)
  const allowed = (response.headers.get('allow') || '').split(/,\s*/)
  for (const method of methods) assert.ok(allowed.includes(method), `${pathname}: OPTIONS Allow is missing ${method}`)
  if (methods.includes('GET')) {
    assert.ok(allowed.includes('HEAD'), `${pathname}: automatic HEAD missing`)
    assert.equal(routeModule.methods.HEAD, routeModule.userland.GET, `${pathname}: automatic HEAD must bind to the actual GET handler`)
  }
  return { pathname, methods, allow: allowed }
}

if (process.argv.includes('--self-test')) {
  // Reproduce the observed production artifact shape with Next's own method dispatch.
  const { autoImplementMethods } = nativeRequire('next/dist/server/future/route-modules/app-route/helpers/auto-implement-methods')
  const missing = { dynamic: 'force-dynamic' }
  const broken = { userland: missing, methods: autoImplementMethods(missing) }
  assert.equal((await broken.methods.GET()).status, 405)
  assert.equal((await broken.methods.OPTIONS()).headers.get('allow'), 'OPTIONS')
  await assert.rejects(() => verifyRoute(broken, routes[0]), /built GET export missing/)
  const get = { dynamic: 'force-dynamic', GET: () => Response.json({ ok: true }) }
  const post = { dynamic: 'force-dynamic', POST: () => Response.json({ ok: true }) }
  await verifyRoute({ userland: get, methods: autoImplementMethods(get) }, routes[0])
  await verifyRoute({ userland: post, methods: autoImplementMethods(post) }, routes[2])
  console.log('生产路由导出门禁自测通过：真实Next方法分派复现空405，缺失导出被拒绝，GET/POST及HEAD/OPTIONS绑定通过。未运行生产构建或业务处理器。')
} else {
  const args = process.argv.slice(2)
  assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--build-dir'), 'Usage: node scripts/verify-production-route-exports.mjs [--build-dir path]')
  const build = resolve(args[1] || '.next')
  const buildId = join(build, 'BUILD_ID')
  assert.ok(statSync(buildId, { throwIfNoEntry: false })?.isFile(), '生产导出检查需要已完成的Next生产构建（BUILD_ID）；由CI的Production build之后执行，不接受开发构建代替。')
  const manifest = JSON.parse(readFileSync(join(build, 'server', 'app-paths-manifest.json'), 'utf8'))
  process.env.NODE_ENV = 'production'
  const results = []
  for (const route of routes) {
    const entry = manifest[`${route.pathname}/route`]
    assert.equal(typeof entry, 'string', `${route.pathname}: route not found in production app-paths-manifest`)
    const compiled = nativeRequire(join(build, 'server', entry))
    assert.equal(compiled.routeModule?.definition?.pathname, route.pathname, `${route.pathname}: compiled route definition mismatch`)
    results.push(await verifyRoute(compiled.routeModule, route))
  }
  console.log(JSON.stringify({ status: 'PASS', buildId: readFileSync(buildId, 'utf8').trim(), routes: results, businessHandlersExecuted: false }, null, 2))
}
