import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { workspaceFunctionCatalog } from '../app/app-navigation'
import { registeredPageDefinitions } from '../lib/page-registry'
import { isWorkspaceFunctionKey } from '../lib/workspace'
import { buildDataPlatformFunctions } from '../modules/workspace/domain/data-platform-functions'

// Guard against the prototype's semantic collision: orders is manufacturing, not sales.
for (const [key, tab, resource] of [
  ['orders', 'orders', 'orders'],
  ['salesOrders', 'salesOrders', 'salesOrder'],
  ['shipment', 'shipment', 'shipment'],
  ['stocks', 'stocks', 'stocks'],
] as const) {
  const item = workspaceFunctionCatalog.find((candidate) => candidate.key === key)
  assert.ok(item)
  assert.equal(item.tab, tab)
  assert.equal(item.resource, resource)
  assert.equal(item.externalHref, undefined)
  assert.ok(registeredPageDefinitions.some((page) => page.tab === tab && page.workspace?.functionKey === key))
}

const entries = buildDataPlatformFunctions(undefined)
assert.equal(entries.length, 8)
assert.equal(new Set(entries.map((entry) => entry.key)).size, entries.length)
for (const entry of entries) {
  assert.ok(isWorkspaceFunctionKey(entry.key), 'External favorites must survive the existing preference normalization')
  assert.ok(['customers', 'equipment'].includes(entry.resource), 'Links do not grant target application permissions')
  const url = new URL(entry.externalHref)
  assert.equal(url.origin, 'https://fix.xiangshu.me')
  assert.equal(url.pathname, '/login')
  assert.match(url.searchParams.get('next') || '', /^\/workspaces\/local\/default\//)
  const parameterNames: string[] = []
  url.searchParams.forEach((_value, name) => parameterNames.push(name))
  assert.deepEqual(parameterNames, ['next'], 'Never forward local session or credential fields')
}
assert.equal(new URL(entries.find((entry) => entry.key === 'dataContacts')!.externalHref).searchParams.get('next'), '/workspaces/local/default/data/contacts')
assert.equal(new URL(entries.find((entry) => entry.key === 'dataCustomerMap')!.externalHref).searchParams.get('next'), '/workspaces/local/default/data/customers?map=1&layers=customers')
assert.ok(!entries.some((entry) => /订单/.test(entry.label)), 'Do not advertise a non-integrated MES order map')

const moved = buildDataPlatformFunctions('https://future.example/workspaces/company/sales/')
assert.equal(new URL(moved[1].externalHref).searchParams.get('next'), '/workspaces/company/sales/data/contacts')
for (const invalid of ['', 'http://example.com/workspaces/local/default', 'javascript:alert(1)',
  'https://u:p@example.com/workspaces/local/default', 'https://example.com/workspaces/local/default?next=evil',
  'https://example.com/workspaces/local/default#secret', 'https://example.com/other', 'not-a-url']) {
  assert.deepEqual(buildDataPlatformFunctions(invalid), [])
}
console.log('真实工作台目录验证通过：原生页面语义、8个精确跨应用登录目的地、域名配置与无凭据转发')

assert.match(readFileSync('Dockerfile', 'utf8'), /ARG NEXT_PUBLIC_DATA_PLATFORM_WORKSPACE_URL=https:\/\/fix\.xiangshu\.me\/workspaces\/local\/default/, 'Container builds must actually receive the public destination option')
