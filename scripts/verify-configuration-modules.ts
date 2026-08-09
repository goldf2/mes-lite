import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const systemPage = read('app/components/SystemPage.tsx')
const homeApp = read('app/HomeApp.tsx')
const workspacePageHost = read('app/components/shell/WorkspacePageHost.tsx')
const workspacePageRenderers = read('app/components/shell/WorkspacePageRendererRegistry.tsx')
const moduleIndex = read('modules/configuration/index.ts')
const referenceDataClient = read('modules/configuration/client/reference-data-api.ts')
const referenceDataContracts = read('modules/configuration/contracts/reference-data.ts')
const partyRouteHandler = read('modules/configuration/http/party-route-handlers.ts')
const partyService = read('modules/configuration/server/party-service.ts')
const locationRoute = read('app/api/inventory-locations/route.ts')
const locationCommandService = read('modules/configuration/server/inventory-location-command-service.ts')
const configurationSection = read('modules/configuration/ConfigurationSectionPage.tsx')

const removedManagers = [
  'SupplierManager',
  'CustomerManager',
  'UnitCatalogManager',
  'InventoryLocationManager',
  'WorkCenterManager',
]

for (const manager of removedManagers) {
  assert.doesNotMatch(systemPage, new RegExp(`function ${manager}\\b`), `${manager} 不得回流到 SystemPage`)
}

assert.ok(systemPage.split('\n').length <= 40, 'SystemPage 已收敛为领域分派层，不得重新超过 40 行')
assert.match(systemPage, /from '@\/modules\/configuration'/, 'SystemPage 必须通过配置模块公开入口挂载')
assert.doesNotMatch(systemPage, /function SettingsManager\b|naturalMaterialCodeSortEnabled|companyProfile/, '企业资料和业务规则不得回流 SystemPage')
assert.match(homeApp, /<WorkspacePageHost\b/, '应用壳必须通过公共页面宿主加载业务页面')
assert.match(workspacePageHost, /renderRegisteredWorkspacePage/, '公共页面宿主必须通过渲染注册表挂载页面')
assert.match(workspacePageRenderers, /import\('@\/modules\/configuration'\)/, '文档类别必须通过配置模块公开入口加载')
assert.ok(!existsSync(join(root, 'app/components/DocumentCategorySettingsPage.tsx')), '旧文档类别页面不得保留并行实现')
assert.match(moduleIndex, /DocumentCategorySettingsPage/, '配置模块必须公开文档类别页面')
assert.match(moduleIndex, /isConfigurationSection/, '配置模块必须公开包含业务设置的统一分区守卫')
assert.match(read('modules/configuration/ui/BusinessSettingsPage.tsx'), /<ResourcePageShell\b/, '企业与业务规则必须使用公共 ResourcePageShell')
assert.doesNotMatch(read('modules/configuration/ui/BusinessSettingsPage.tsx'), /fetch\(/, '业务设置 UI 必须通过模块 client 调用 API')

const resourcePages = [
  'modules/configuration/ui/PartySettingsPage.tsx',
  'modules/configuration/ui/InventoryLocationSettingsPage.tsx',
  'modules/configuration/ui/UnitSettingsPage.tsx',
]

for (const path of resourcePages) {
  assert.match(read(path), /<ResourcePage\b/, `${path} 必须使用公共 ResourcePage`)
  assert.doesNotMatch(read(path), /\bfetch\(/, `${path} 不得直接调用 fetch`)
}

const partyPage = read('modules/configuration/ui/PartySettingsPage.tsx')
assert.match(partyPage, /kind: PartyKind/, '供应商和客户必须共用参数化资料页')
assert.doesNotMatch(partyPage, /\bfetch\(/, '供应商和客户参数化资料页不得直接调用 fetch')
assert.match(referenceDataClient, /\/api\/suppliers/, '配置领域 client 必须包含供应商接口')
assert.match(referenceDataClient, /\/api\/customers/, '配置领域 client 必须包含客户接口')
assert.match(referenceDataClient, /loadInventoryLocations|loadConfiguredUnits|loadDocumentCategories/, '配置领域 client 必须集中自身资料读取')
assert.doesNotMatch(referenceDataClient, /loadWorkCenters|saveWorkCenter|archiveWorkCenter/, '工作中心请求必须归属设备领域')
assert.match(referenceDataContracts, /interface PartyRecord|interface ConfiguredUnit|interface InventoryLocationConfig|interface DocumentCategoryConfig/, '配置领域必须集中自身参考资料契约')
assert.doesNotMatch(referenceDataContracts, /interface WorkCenterConfig|interface WorkCenterForm/, '工作中心契约必须归属设备领域')
assert.match(configurationSection, /from '@\/modules\/equipment'/, '业务配置只通过设备领域公开入口挂载工作中心')
assert.ok(!existsSync(join(root, 'modules/configuration/ui/WorkCenterSettingsPage.tsx')), '配置领域不得保留工作中心页面副本')
assert.match(partyRouteHandler, /createPartyRouteHandlers/, '供应商和客户 API 必须共用配置领域 HTTP 适配器')
assert.doesNotMatch(partyRouteHandler, /@\/lib\/prisma|\bprisma\./, '配置领域 HTTP 适配器不得直接访问 Prisma')
assert.doesNotMatch(partyService, /NextRequest|NextResponse|requireResourcePermission|writeAuditLog/, '配置领域服务必须与 HTTP、权限和请求审计解耦')
for (const path of ['app/api/suppliers/route.ts', 'app/api/customers/route.ts']) {
  const route = read(path)
  assert.ok(route.split('\n').length <= 10, `${path} 必须保持为薄资源声明`)
  assert.doesNotMatch(route, /@\/lib\/prisma|\bprisma\./, `${path} 不得直接访问 Prisma`)
}
assert.doesNotMatch(locationRoute, /@\/lib\/prisma|\bprisma\.|\$transaction\(/, '库位 API 不得直接访问 Prisma 或持有事务')
assert.match(locationRoute, /@\/modules\/configuration\//, '库位 API 必须委托配置领域')
assert.doesNotMatch(locationCommandService, /NextRequest|NextResponse|requireResourcePermission|writeAuditLog/, '库位命令服务必须与 HTTP、权限和请求审计解耦')
assert.match(moduleIndex, /export \{ loadConfiguredUnits \}/, '配置模块必须通过公开出口提供单位目录读取能力')
const categoryPage = read('modules/configuration/ui/DocumentCategorySettingsPage.tsx')
assert.match(categoryPage, /<ResourcePageShell\b/, '树形文档类别必须使用公共 ResourcePageShell')
assert.doesNotMatch(categoryPage, /\bfetch\(/, '文档类别页不得直接调用 fetch')

console.log(`配置模块校验通过：${resourcePages.length} 个自有 ResourcePage、1 个树形 ResourcePageShell，工作中心经设备领域公开入口挂载，SystemPage ${systemPage.split('\n').length} 行。`)
