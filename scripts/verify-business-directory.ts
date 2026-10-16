import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { middleware } from '../middleware'
import { parseDirectoryQuery, readDirectoryConfiguration } from '../modules/platform-integration/domain/business-directory'
import { registeredPageDefinitions } from '../lib/page-registry'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-directory-'))
const previousEnv = { ...process.env }
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl
process.env.BUSINESS_DIRECTORY_ENABLED = 'true'
const fixtureKey = 'directory-fixture-key-only-not-a-production-secret'
process.env.BUSINESS_DIRECTORY_API_KEY_SHA256 = createHash('sha256').update(fixtureKey).digest('hex')
process.env.BUSINESS_DIRECTORY_EXPIRES_AT = '2099-01-01T00:00:00Z'
process.env.BUSINESS_DIRECTORY_INSTANCE_ID = 'mes-fixture'
process.env.BUSINESS_DIRECTORY_TENANT_ID = 'declared-source-enterprise'
process.env.BUSINESS_DIRECTORY_WORKSPACE_ID = 'declared-source-workspace'
const source = { appId: 'mes-lite', instanceId: 'mes-fixture', tenantId: 'declared-source-enterprise', workspaceId: 'declared-source-workspace' }
const endpoint = (resource: string, query = '') => `http://localhost/api/integrations/business-directory/v1/${resource}${query}`
const request = (resource = 'enterprises', query = '', headers: Record<string, string> = { Authorization: `Bearer ${fixtureKey}` }) => new Request(endpoint(resource, query), { headers })

async function main() {
  const [{ prisma }, { businessDirectoryGet }, { getBusinessDirectoryDiagnostics }, { getEffectivePermissionMap }] = await Promise.all([
    import('../lib/prisma'), import('../modules/platform-integration/http/business-directory-http'),
    import('../modules/platform-integration/server/business-directory-service'), import('../lib/permissions'),
  ])
  try {
    const operator = await prisma.operator.create({ data: {
      id: 'directory-reader', username: 'directory-reader', passwordHash: 'fixture-only', name: '目录验证人员', role: 'OPERATOR', status: 'ACTIVE',
    } })
    process.env.BUSINESS_DIRECTORY_OPERATOR_ID = operator.id
    await prisma.permissionSetting.create({ data: { role: 'OPERATOR', resource: 'customers', canRead: true } })
    await prisma.customer.createMany({ data: [
      { id: 'customer-a', code: 'A', name: '甲企业', contact: '甲联系人', phone: 'fixture-phone', address: '甲地址', sortOrder: 0 },
      { id: 'customer-b', code: 'B', name: '乙企业', contact: '   ', address: '', sortOrder: 1 },
      { id: 'customer-c', code: 'C', name: '丙企业', contact: '丙联系人', address: '丙地址', sortOrder: 2 },
      { id: 'customer-archived', code: 'ARCHIVED', name: '归档企业', contact: '旧联系人', address: '旧地址', deletedAt: new Date() },
    ] })
    const snapshot = async () => {
      const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      const data = []
      for (const { name } of tables) data.push([name, await prisma.$queryRawUnsafe(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`)])
      return createHash('sha256').update(JSON.stringify(data, (_, value) => typeof value === 'bigint' ? String(value) : value)).digest('hex')
    }
    const before = await snapshot()
    assert.equal(await prisma.permissionSetting.count(), 1)
    for (const resource of ['enterprises', 'contacts', 'locations'] as const) {
      const response = await businessDirectoryGet(request(resource, '?limit=1'), resource)
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const payload = await response.json()
      assert.deepEqual(Object.keys(payload).sort(), ['page', 'records', 'resource', 'schemaVersion', 'source'])
      assert.equal(payload.schemaVersion, 'business-directory.v1')
      assert.deepEqual(payload.source, source)
      assert.deepEqual(payload.page, { limit: 1, offset: 0, total: resource === 'enterprises' ? 3 : 2, hasMore: true })
      const record = payload.records[0]
      assert.equal(record.projection, true)
      assert.equal(record.readOnly, true)
      assert.equal(record.revision, null)
      assert.equal(record.updatedAt, null)
      assert.deepEqual(record.sourceRef, { ...source, resource, recordId: record.id })
      if (resource === 'enterprises') {
        assert.deepEqual(Object.keys(record).sort(), ['id', 'code', 'name', 'primaryContactName', 'phone', 'email', 'address', 'revision', 'updatedAt', 'sourceRef', 'projection', 'readOnly'].sort())
        assert.equal(record.id, 'customer-a')
      } else {
        assert.equal(record.enterpriseId, 'customer-a')
        assert.equal(record.enterpriseName, '甲企业')
        assert.equal(record.id, `${resource === 'contacts' ? 'customer-contact' : 'customer-address'}:customer-a`)
      }
      if (resource === 'contacts') assert.deepEqual(Object.keys(record).sort(), ['id', 'enterpriseId', 'enterpriseName', 'name', 'phone', 'email', 'role', 'revision', 'updatedAt', 'sourceRef', 'projection', 'readOnly'].sort())
      if (resource === 'locations') {
        assert.equal(record.coordinate, null)
        assert.deepEqual(Object.keys(record).sort(), ['id', 'enterpriseId', 'enterpriseName', 'name', 'address', 'province', 'city', 'coordinate', 'revision', 'updatedAt', 'sourceRef', 'projection', 'readOnly'].sort())
      }
    }
    const filtered = await (await businessDirectoryGet(request('contacts', '?enterpriseId=customer-c&q=丙&offset=0&limit=100'), 'contacts')).json()
    assert.equal(filtered.records[0].id, 'customer-contact:customer-c')
    assert.equal(filtered.page.total, 1)
    const empty = await (await businessDirectoryGet(request('locations', '?enterpriseId=customer-b'), 'locations')).json()
    assert.deepEqual(empty.records, [])
    const beyond = await (await businessDirectoryGet(request('enterprises', '?offset=100000'), 'enterprises')).json()
    assert.deepEqual(beyond.records, [])
    assert.equal(beyond.page.hasMore, false)
    for (const query of ['?actor=admin', '?tenantId=foreign', '?workspaceId=foreign', '?q=a&q=b', '?q=' + 'x'.repeat(201), '?limit=0', '?limit=101', '?limit=1e2', '?offset=-1', '?offset=100001', '?enterpriseId=']) {
      assert.equal((await businessDirectoryGet(request('enterprises', query), 'enterprises')).status, 400, query)
    }
    assert.equal((await businessDirectoryGet(request('enterprises', '', {}), 'enterprises')).status, 401)
    assert.equal((await businessDirectoryGet(request('enterprises', '', { Cookie: 'mes_lite_session=fixture-not-a-session' }), 'enterprises')).status, 401)
    assert.equal((await businessDirectoryGet(request('enterprises', '', { Authorization: 'Bearer wrong', Cookie: 'mes_lite_session=fixture-not-a-session' }), 'enterprises')).status, 401)
    const diagnostics = await getBusinessDirectoryDiagnostics()
    assert.equal(diagnostics.ready, true)
    assert.equal(JSON.stringify(diagnostics).includes(fixtureKey), false)
    assert.equal(JSON.stringify(diagnostics).includes(process.env.BUSINESS_DIRECTORY_API_KEY_SHA256!), false)
    assert.equal(JSON.stringify(diagnostics).includes(operator.id), false)
    assert.equal(await snapshot(), before, '全部有效、无效目录读取及诊断均不得修改数据库或创建会话/权限')
    assert.equal(await prisma.permissionSetting.count(), 1, '只读权限解析不得初始化默认权限表')

    await prisma.permissionSetting.update({ where: { role_resource: { role: 'OPERATOR', resource: 'customers' } }, data: { canRead: false } })
    await prisma.permissionSetting.create({ data: { role: 'OPERATOR', resource: 'salesOrder', canRead: true } })
    assert.equal((await businessDirectoryGet(request(), 'enterprises')).status, 403, '原有销售下拉可读不能替代精确customers.read')
    await prisma.operatorPermissionOverride.create({ data: { operatorId: operator.id, resource: 'customers', canRead: true, legacyPermanent: true } })
    assert.equal((await businessDirectoryGet(request(), 'enterprises')).status, 200)
    await prisma.operatorPermissionOverride.update({ where: { operatorId_resource: { operatorId: operator.id, resource: 'customers' } }, data: { canRead: false } })
    assert.equal((await businessDirectoryGet(request(), 'enterprises')).status, 403, '每请求必须重查撤销的个人权限')
    await prisma.operator.update({ where: { id: operator.id }, data: { role: 'ADMIN', status: 'DISABLED' } })
    assert.equal((await businessDirectoryGet(request(), 'enterprises')).status, 403, '停用管理员同样拒绝')
    await prisma.operator.update({ where: { id: operator.id }, data: { status: 'ACTIVE' } })
    assert.equal((await businessDirectoryGet(request(), 'enterprises')).status, 200, '保留现有ADMIN读取权限语义')
    process.env.BUSINESS_DIRECTORY_OPERATOR_ID = 'missing-operator'
    assert.equal((await businessDirectoryGet(request(), 'enterprises')).status, 403)
    process.env.BUSINESS_DIRECTORY_OPERATOR_ID = operator.id
    for (const key of ['BUSINESS_DIRECTORY_API_KEY_SHA256', 'BUSINESS_DIRECTORY_OPERATOR_ID', 'BUSINESS_DIRECTORY_INSTANCE_ID', 'BUSINESS_DIRECTORY_TENANT_ID', 'BUSINESS_DIRECTORY_WORKSPACE_ID', 'BUSINESS_DIRECTORY_EXPIRES_AT']) {
      const value = process.env[key]
      delete process.env[key]
      assert.equal((await businessDirectoryGet(request(), 'enterprises')).status, 503, key)
      process.env[key] = value
    }
    process.env.BUSINESS_DIRECTORY_EXPIRES_AT = 'invalid-date'
    assert.equal((await businessDirectoryGet(request(), 'enterprises')).status, 503)
    process.env.BUSINESS_DIRECTORY_EXPIRES_AT = '2000-01-01T00:00:00Z'
    assert.equal((await businessDirectoryGet(request(), 'enterprises')).status, 403, '过期委托不得继续读取')
    process.env.BUSINESS_DIRECTORY_EXPIRES_AT = '2099-01-01T00:00:00Z'
    const originalDigest = process.env.BUSINESS_DIRECTORY_API_KEY_SHA256
    process.env.BUSINESS_DIRECTORY_API_KEY_SHA256 = createHash('sha256').update('different-fixture-key-only-not-a-production-secret').digest('hex')
    assert.equal((await businessDirectoryGet(request(), 'enterprises')).status, 401, '轮换摘要后旧密钥立即无效')
    process.env.BUSINESS_DIRECTORY_API_KEY_SHA256 = 'short'
    assert.equal((await businessDirectoryGet(request(), 'enterprises')).status, 503)
    delete process.env.BUSINESS_DIRECTORY_API_KEY_SHA256
    process.env.BUSINESS_DIRECTORY_API_KEY = fixtureKey
    assert.equal((await businessDirectoryGet(request(), 'enterprises')).status, 503, '不兼容仅保存明文的旧变量')
    delete process.env.BUSINESS_DIRECTORY_API_KEY
    process.env.BUSINESS_DIRECTORY_API_KEY_SHA256 = originalDigest
    process.env.BUSINESS_DIRECTORY_ENABLED = 'false'
    assert.equal((await businessDirectoryGet(request(), 'enterprises')).status, 503)
    assert.equal(readDirectoryConfiguration({ NODE_ENV: 'test' }).enabled, false)
    assert.equal(parseDirectoryQuery(new URLSearchParams()).limit, 50)
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
      assert.equal(middleware(new NextRequest(endpoint('contacts'), { method })).status, 405)
    }
    assert.equal(middleware(new NextRequest(endpoint('contacts'))).status, 200)
    assert.equal(middleware(new NextRequest('http://localhost/api/customers')).status, 401, '原CRUD会话保护不变')
    assert.equal(middleware(new NextRequest('http://localhost/api/integrations/business-directory/v1/unknown')).status, 401, '不能扩大middleware例外到任意集成接口')
    assert.equal(registeredPageDefinitions.find((page) => page.key === 'apiSettings')?.adminOnly, true)
    const diagnosticsSource = readFileSync(join(root, 'modules/platform-integration/http/business-directory-http.ts'), 'utf8')
    assert.match(diagnosticsSource, /current\.role !== 'ADMIN'/)
    assert.match(readFileSync(join(root, 'app/components/shell/useApplicationNavigationController.tsx'), 'utf8'), /!item\.adminOnly \|\| operator\.role === 'ADMIN'/)
    assert.equal((await getEffectivePermissionMap({ id: operator.id, role: 'OPERATOR' }, { initializeDefaults: false })).customers.canRead, false)
    console.log('业务目录验证通过：隔离SQLite真实权限、三类白名单投影、固定来源、分页过滤、撤权/停用、无初始化写入、无会话替代与精确路由边界。')
  } finally { await prisma.$disconnect() }
}

main().finally(() => {
  for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key]
  Object.assign(process.env, previousEnv)
  rmSync(verifyRoot, { recursive: true, force: true })
}).catch((error) => { console.error(error); process.exitCode = 1 })
