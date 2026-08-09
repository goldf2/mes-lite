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
  'modules/configuration/ui/WorkCenterSettingsPage.tsx',
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
assert.match(referenceDataClient, /loadInventoryLocations|loadConfiguredUnits|loadWorkCenters|loadDocumentCategories/, '配置领域 client 必须集中资料读取')
assert.match(referenceDataContracts, /interface PartyRecord|interface ConfiguredUnit|interface InventoryLocationConfig|interface WorkCenterConfig|interface DocumentCategoryConfig/, '配置领域必须集中参考资料契约')
assert.match(moduleIndex, /export \{ loadConfiguredUnits \}/, '配置模块必须通过公开出口提供单位目录读取能力')
const categoryPage = read('modules/configuration/ui/DocumentCategorySettingsPage.tsx')
assert.match(categoryPage, /<ResourcePageShell\b/, '树形文档类别必须使用公共 ResourcePageShell')
assert.doesNotMatch(categoryPage, /\bfetch\(/, '文档类别页不得直接调用 fetch')

console.log(`配置模块校验通过：${resourcePages.length} 个 ResourcePage、1 个树形 ResourcePageShell、0 个页面级 fetch，SystemPage ${systemPage.split('\n').length} 行。`)
