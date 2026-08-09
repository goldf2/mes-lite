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

assert.ok(systemPage.split('\n').length < 2200, 'SystemPage 必须保持在 2200 行以内')
assert.match(systemPage, /from '@\/modules\/configuration'/, 'SystemPage 必须通过配置模块公开入口挂载')
assert.match(homeApp, /<WorkspacePageHost\b/, '应用壳必须通过公共页面宿主加载业务页面')
assert.match(workspacePageHost, /renderRegisteredWorkspacePage/, '公共页面宿主必须通过渲染注册表挂载页面')
assert.match(workspacePageRenderers, /import\('@\/modules\/configuration'\)/, '文档类别必须通过配置模块公开入口加载')
assert.ok(!existsSync(join(root, 'app/components/DocumentCategorySettingsPage.tsx')), '旧文档类别页面不得保留并行实现')
assert.match(moduleIndex, /DocumentCategorySettingsPage/, '配置模块必须公开文档类别页面')

const resourcePages = [
  'modules/configuration/ui/PartySettingsPage.tsx',
  'modules/configuration/ui/InventoryLocationSettingsPage.tsx',
  'modules/configuration/ui/UnitSettingsPage.tsx',
  'modules/configuration/ui/WorkCenterSettingsPage.tsx',
]

for (const path of resourcePages) {
  assert.match(read(path), /<ResourcePage\b/, `${path} 必须使用公共 ResourcePage`)
}

const partyPage = read('modules/configuration/ui/PartySettingsPage.tsx')
assert.match(partyPage, /kind: PartyKind/, '供应商和客户必须共用参数化资料页')
assert.match(partyPage, /\/api\/suppliers/, '参数化资料页必须包含供应商接口配置')
assert.match(partyPage, /\/api\/customers/, '参数化资料页必须包含客户接口配置')
assert.match(read('modules/configuration/ui/DocumentCategorySettingsPage.tsx'), /<ResourcePageShell\b/, '树形文档类别必须使用公共 ResourcePageShell')

console.log(`配置模块校验通过：${resourcePages.length} 个 ResourcePage、1 个树形 ResourcePageShell，SystemPage ${systemPage.split('\n').length} 行。`)
