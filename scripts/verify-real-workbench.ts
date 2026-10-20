import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { workspaceFunctionCatalog } from '../app/app-navigation'
import { registeredPageDefinitions } from '../lib/page-registry'
import { isWorkspaceFunctionKey } from '../lib/workspace'
import { businessEntryUrls, configuredEntryOrigin } from '../lib/platform-entry'
import { buildDataPlatformFunctions } from '../modules/workspace/domain/data-platform-functions'
import {
  businessModuleDefinitions,
  getAvailableBusinessModules,
  getBusinessModuleForFunction,
} from '../modules/workspace/domain/business-modules'
import {
  businessApplicationDefinitions,
  getAvailableBusinessApplications,
} from '../modules/workspace/domain/business-applications'

assert.deepEqual(businessEntryUrls({
  NODE_ENV: 'production',
  APP_ORIGIN: 'https://mes.csyufeng.com',
  PLATFORM_ORIGIN: 'https://work.csyufeng.com',
}), {
  mesUrl: 'https://mes.csyufeng.com',
  platformUrl: 'https://work.csyufeng.com',
}, 'MES 与平台必须从独立的运行时配置获取严格公开 origin')
assert.deepEqual(businessEntryUrls({ NODE_ENV: 'production', MES_PUBLIC_BASE_URL: 'https://future-mes.example' }), {
  mesUrl: 'https://future-mes.example',
  platformUrl: undefined,
}, '未来换域和未配置平台地址必须保留明确兼容行为')
for (const invalid of ['http://work.csyufeng.com', 'https://user:secret@work.csyufeng.com',
  'https://work.csyufeng.com/platform', 'https://work.csyufeng.com/?next=other',
  'https://work.csyufeng.com/#fragment', 'javascript:alert(1)', 'not-an-origin']) {
  assert.equal(configuredEntryOrigin(invalid, 'production'), undefined, '公开入口必须拒绝非 HTTPS、凭据、路径、查询和片段')
}
assert.equal(configuredEntryOrigin('http://localhost:3000', 'development'), 'http://localhost:3000', '本地双 host 验证只允许开发环境 loopback HTTP')
assert.equal(configuredEntryOrigin('http://localhost:3000', 'production'), undefined, '本地验证例外不得放宽生产协议')
assert.equal(configuredEntryOrigin('http://work.example:3000', 'development'), undefined, '开发 HTTP 例外不得扩展到远程站点')

const globalFunctionKeys = new Set(['dashboard', 'businessWorkbench'])
const moduleFunctions = workspaceFunctionCatalog.filter((item) => !globalFunctionKeys.has(item.key))
const availableModules = getAvailableBusinessModules(workspaceFunctionCatalog)
const assignedFunctions = availableModules.flatMap((module) => module.items)
assert.equal(businessModuleDefinitions.length, 9)
assert.equal(new Set(businessModuleDefinitions.map((module) => module.key)).size, businessModuleDefinitions.length)
assert.equal(assignedFunctions.length, moduleFunctions.length, 'Every real function belongs to exactly one business module')
assert.equal(new Set(assignedFunctions.map((item) => item.key)).size, assignedFunctions.length, 'A function cannot appear in multiple modules')
assert.deepEqual(assignedFunctions.map((item) => item.key).sort(), moduleFunctions.map((item) => item.key).sort(), 'Module partition must cover the complete real function catalog')
for (const businessModule of availableModules) {
  for (const item of businessModule.items) {
    assert.equal(getBusinessModuleForFunction(item.key)?.key, businessModule.key, `${item.key} must resolve to its declared module`)
    assert.equal(businessModule.ownerApp, item.externalHref ? 'data-platform' : 'mes', `${item.key} must retain its original application owner`)
    if (item.externalHref) assert.ok(businessModule.key === 'customers' || businessModule.key === 'service', 'Data-platform navigation belongs only to customer modules')
  }
}
for (const key of ['dashboard', 'businessWorkbench'] as const) {
  assert.equal(getBusinessModuleForFunction(key), undefined, 'Global entry pages must not be classified as a business module')
}
const shipmentOnly = workspaceFunctionCatalog.filter((item) => item.key === 'shipment')
const shipmentModules = getAvailableBusinessModules(shipmentOnly)
assert.deepEqual(shipmentModules.map((module) => module.key), ['logistics'], 'A permission-filtered subset must not reveal empty or unrelated modules')
assert.deepEqual(shipmentModules[0].items, shipmentOnly)
assert.deepEqual(getAvailableBusinessModules([]), [], 'An account without available functions has no business modules')
assert.deepEqual(getAvailableBusinessModules(workspaceFunctionCatalog.filter((item) => globalFunctionKeys.has(item.key))), [], 'Global page access alone must not imply business-module access')
assert.equal(getBusinessModuleForFunction('salesOrders')?.key, 'sales')
assert.equal(getBusinessModuleForFunction('orders')?.key, 'production')
assert.equal(getBusinessModuleForFunction('taskCollaboration')?.key, 'production')
assert.equal(registeredPageDefinitions.find(page => page.key === 'taskCollaboration')?.extraResource, undefined, '普通任务读者不应被发布命令权限排除出入口')
for (const key of ['materialManagement', 'bomWorkspace', 'bomUsage'] as const) assert.equal(getBusinessModuleForFunction(key)?.key, 'materials')
for (const key of ['flowTransfers', 'scanPrint'] as const) assert.equal(getBusinessModuleForFunction(key)?.key, 'inventory')

const applications = getAvailableBusinessApplications(workspaceFunctionCatalog)
assert.deepEqual(businessApplicationDefinitions.map((application) => [application.key, application.ownerApp]), [
  ['mes', 'mes'], ['customers', 'data-platform'],
], 'The platform has exactly two real application owners; business modules are not separate placeholder applications')
assert.equal(new Set(businessApplicationDefinitions.map((application) => application.key)).size, businessApplicationDefinitions.length)
assert.deepEqual(applications.map((application) => application.key), ['mes', 'customers'])
const applicationItems = applications.flatMap((application) => application.items)
assert.equal(new Set(applicationItems.map((item) => item.key)).size, applicationItems.length, 'A real function belongs to only one top-level application')
assert.deepEqual(applicationItems.map((item) => item.key).sort(), workspaceFunctionCatalog.filter((item) => item.key !== 'businessWorkbench').map((item) => item.key).sort(), 'The two applications cover all real functions while the platform itself remains a separate entry')
for (const application of applications) {
  assert.ok(application.items.length > 0, 'An empty application cannot be advertised as usable')
  assert.ok(application.modules.every((module) => module.ownerApp === application.ownerApp), 'Nested business modules must retain the application owner')
  for (const item of application.items) {
    assert.equal(application.ownerApp, item.externalHref ? 'data-platform' : 'mes', `${item.key} cannot be moved across application or authentication boundaries by the launcher`)
  }
}
const shipmentApplications = getAvailableBusinessApplications(shipmentOnly)
assert.deepEqual(shipmentApplications.map((application) => application.key), ['mes'], 'A shipping-only account must not discover the unrelated customer application')
assert.deepEqual(shipmentApplications[0].items, shipmentOnly, 'Application grouping must not invent extra native function access')
assert.deepEqual(shipmentApplications[0].modules.map((module) => module.key), ['logistics'])
for (const [functionKey, moduleKey] of [['dataContacts', 'customers'], ['dataDeviceMap', 'service']] as const) {
  const allowed = workspaceFunctionCatalog.filter((item) => item.key === functionKey)
  const allowedApplications = getAvailableBusinessApplications(allowed)
  assert.deepEqual(allowedApplications.map((application) => application.key), ['customers'], `${functionKey} must expose only its actual data-platform application`)
  assert.deepEqual(allowedApplications[0].items, allowed, 'Permission-filtered external entries must keep the exact original destination without adding sibling access')
  assert.deepEqual(allowedApplications[0].modules.map((module) => module.key), [moduleKey])
}
const dashboardOnly = workspaceFunctionCatalog.filter((item) => item.key === 'dashboard')
const dashboardApplications = getAvailableBusinessApplications(dashboardOnly)
assert.deepEqual(dashboardApplications.map((application) => application.key), ['mes'], 'The original MES home remains a real entry even when no other business function is authorized')
assert.deepEqual(dashboardApplications[0].items, dashboardOnly)
assert.deepEqual(dashboardApplications[0].modules, [], 'MES home permission must not create business-module grants')
assert.deepEqual(getAvailableBusinessApplications([]), [], 'An account without available entries must not see placeholder applications')
assert.deepEqual(getAvailableBusinessApplications(workspaceFunctionCatalog.filter((item) => item.key === 'businessWorkbench')), [], 'Platform-entry access alone must not grant either business application')

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
assert.deepEqual(getAvailableBusinessModules(entries).map((module) => [module.key, module.ownerApp, module.items.length]), [
  ['customers', 'data-platform', 4],
  ['service', 'data-platform', 4],
], 'The eight external destinations retain data-platform ownership and split into customer management and service')
const externalApplications = getAvailableBusinessApplications(entries)
assert.deepEqual(externalApplications.map((application) => [application.key, application.ownerApp, application.items.length]), [
  ['customers', 'data-platform', 8],
], 'Customer management and service share one actual data-platform application instead of becoming duplicate apps')
assert.deepEqual(externalApplications[0].modules.map((module) => module.key), ['customers', 'service'])
for (const entry of entries) {
  assert.ok(isWorkspaceFunctionKey(entry.key), 'External favorites must survive the existing preference normalization')
  assert.ok(['customers', 'equipment'].includes(entry.resource), 'Links do not grant target application permissions')
  const url = new URL(entry.externalHref)
  assert.equal(url.origin, 'https://crm.csyufeng.com')
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
console.log('真实工作台目录验证通过：两个真实一级应用、9个模块唯一归属、按可用功能过滤、原生页面语义与8个精确跨应用目的地')

assert.match(readFileSync('Dockerfile', 'utf8'), /ARG NEXT_PUBLIC_DATA_PLATFORM_WORKSPACE_URL=https:\/\/fix\.xiangshu\.me\/workspaces\/local\/default/, 'Container builds must actually receive the public destination option')
