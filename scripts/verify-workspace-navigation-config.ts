import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  configurableWorkspaceFunctionKeys,
  createDefaultWorkspaceNavigationConfig,
  enabledNavigationWorkspaces,
  navigationWorkspaceIds,
  normalizeWorkspaceNavigationConfig,
  workspaceNavigationGroupKeys,
  workspaceContainsFunction,
  workspaceFunctionLabel,
  workspaceOwnerOfFunction,
} from '../lib/workspace-navigation-config'

const defaults = createDefaultWorkspaceNavigationConfig()
assert.equal(workspaceContainsFunction(defaults, 'mes', 'orders'), true)
assert.equal(workspaceContainsFunction(defaults, 'mes', 'dispatch'), true)
assert.equal(workspaceContainsFunction(defaults, 'mrp', 'bomUsage'), true)
assert.equal(workspaceContainsFunction(defaults, 'erp', 'salesOrders'), true)
assert.equal(workspaceContainsFunction(defaults, 'erp', 'navigationSettings'), true, '公共系统页面必须在每个工作区可见')
assert.equal(workspaceContainsFunction(defaults, 'mes', 'shipment'), false)
for (const functionKey of configurableWorkspaceFunctionKeys) {
  const owners = navigationWorkspaceIds.filter((workspace) => workspaceContainsFunction(defaults, workspace, functionKey))
  assert.equal(owners.length, 1, `${functionKey} 必须且只能属于一个业务工作区`)
}
for (const workspace of navigationWorkspaceIds) {
  assert.deepEqual(defaults.workspaces[workspace].groupOrder, workspaceNavigationGroupKeys)
}

const configured = normalizeWorkspaceNavigationConfig({
  defaultWorkspace: 'erp',
  workspaces: {
    mes: { enabled: true, items: [{ functionKey: 'orders', label: '生产任务' }] },
    mrp: { enabled: true, groupOrder: ['system', 'materials'], items: [{ functionKey: 'orders', label: '计划订单' }] },
    erp: { enabled: true, items: [{ functionKey: 'orders', label: '生产订单' }, { functionKey: 'orders', label: '重复项' }] },
  },
})

assert.equal(workspaceFunctionLabel(configured, 'mes', 'orders', '生产订单'), '生产任务')
assert.equal(workspaceFunctionLabel(configured, 'mrp', 'orders', '生产订单'), '生产订单')
assert.equal(workspaceFunctionLabel(configured, 'erp', 'orders', '生产订单'), '生产订单')
assert.equal(workspaceOwnerOfFunction(configured, 'orders'), 'mes', '旧配置重复归属时必须收敛到系统默认主工作区')
assert.equal(navigationWorkspaceIds.filter((workspace) => workspaceContainsFunction(configured, workspace, 'orders')).length, 1, '同一页面不得跨工作区重复出现')
assert.equal(workspaceContainsFunction(configured, 'mes', 'materialManagement'), true, '缺失的新增页面必须按系统默认归属补回')
assert.deepEqual(configured.workspaces.mrp.groupOrder.slice(0, 2), ['system', 'materials'], '一级菜单自定义顺序必须保留')
assert.equal(new Set(configured.workspaces.mrp.groupOrder).size, workspaceNavigationGroupKeys.length, '一级菜单顺序必须自动补齐且不重复')

const allDisabled = normalizeWorkspaceNavigationConfig({
  defaultWorkspace: 'erp',
  workspaces: {
    mes: { enabled: false, items: [] },
    mrp: { enabled: false, items: [] },
    erp: { enabled: false, items: [] },
  },
})
assert.deepEqual(enabledNavigationWorkspaces(allDisabled), ['mes'])
assert.equal(allDisabled.defaultWorkspace, 'mes')

const root = process.cwd()
const shellSource = readFileSync(join(root, 'app/HomeApp.tsx'), 'utf8')
const applicationNavigationSource = readFileSync(join(root, 'app/components/shell/useApplicationNavigationController.tsx'), 'utf8')
const settingsSource = readFileSync(join(root, 'app/components/navigation/WorkspaceNavigationSettings.tsx'), 'utf8')
const routeSource = readFileSync(join(root, 'app/api/system/workspace-navigation/route.ts'), 'utf8')
assert.equal((shellSource.match(/<WorkspaceDomainTabs/g) || []).length, 3, '桌面画布、桌面侧栏和移动菜单都必须提供工作区切换')
assert.match(shellSource, /data-navigation-workspace=\{activeWorkspace\}/, '应用壳必须暴露当前工作区状态')
assert.match(applicationNavigationSource, /configuredGroupOrder/, '桌面侧栏、顶部导航和移动菜单必须读取工作区一级菜单顺序')
assert.match(applicationNavigationSource, /navigationGroups\.sort/, '账号与权限必须与其他统一一级菜单一起参与排序')
assert.match(settingsSource, /所属工作区/, '配置页必须提供页面唯一归属选择')
assert.match(settingsSource, /一级菜单顺序/, '配置页必须允许调整当前工作区一级菜单顺序')
assert.match(settingsSource, /账号与权限/, '一级菜单顺序必须覆盖账号与权限入口')
assert.match(settingsSource, /显示名称留空时使用系统名称/, '配置页必须说明页面显示名称的继承规则')
assert.match(settingsSource, /每个业务页面只能属于一个工作区/, '配置页必须明确页面唯一归属规则')
assert.match(settingsSource, /内部页面 ID、路由、权限和业务数据/, '配置页必须说明重命名不会改变内部语义')
assert.match(routeSource, /requireResourcePermission\('system', 'update'\)/, '发布工作区配置必须受系统更新权限保护')
assert.match(routeSource, /workspaceNavigationGroupKeys/, '接口必须校验一级菜单顺序')

console.log('MES/MRP/ERP 一级菜单顺序、页面唯一归属、别名和安全默认值验证通过')
