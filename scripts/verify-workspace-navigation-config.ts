import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createDefaultWorkspaceNavigationConfig,
  enabledNavigationWorkspaces,
  normalizeWorkspaceNavigationConfig,
  workspaceContainsFunction,
  workspaceFunctionLabel,
} from '../lib/workspace-navigation-config'

const defaults = createDefaultWorkspaceNavigationConfig()
assert.equal(workspaceContainsFunction(defaults, 'mes', 'orders'), true)
assert.equal(workspaceContainsFunction(defaults, 'mes', 'dispatch'), true)
assert.equal(workspaceContainsFunction(defaults, 'mrp', 'bomWorkspace'), true)
assert.equal(workspaceContainsFunction(defaults, 'erp', 'salesOrders'), true)
assert.equal(workspaceContainsFunction(defaults, 'erp', 'navigationSettings'), true, '公共系统页面必须在每个工作区可见')
assert.equal(workspaceContainsFunction(defaults, 'mes', 'shipment'), false)

const configured = normalizeWorkspaceNavigationConfig({
  defaultWorkspace: 'erp',
  workspaces: {
    mes: { enabled: true, items: [{ functionKey: 'orders', label: '生产任务' }] },
    mrp: { enabled: true, items: [{ functionKey: 'orders', label: '计划订单' }] },
    erp: { enabled: true, items: [{ functionKey: 'orders', label: '生产订单' }, { functionKey: 'orders', label: '重复项' }] },
  },
})

assert.equal(workspaceFunctionLabel(configured, 'mes', 'orders', '生产订单'), '生产任务')
assert.equal(workspaceFunctionLabel(configured, 'mrp', 'orders', '生产订单'), '计划订单')
assert.equal(workspaceFunctionLabel(configured, 'erp', 'orders', '生产订单'), '生产订单')
assert.equal(configured.workspaces.erp.items.filter((item) => item.functionKey === 'orders').length, 1, '同一工作区不得重复页面')
assert.equal(workspaceContainsFunction(configured, 'mes', 'materialManagement'), true, '缺失的新增页面必须按系统默认归属补回')

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
const settingsSource = readFileSync(join(root, 'app/components/navigation/WorkspaceNavigationSettings.tsx'), 'utf8')
const routeSource = readFileSync(join(root, 'app/api/system/workspace-navigation/route.ts'), 'utf8')
assert.equal((shellSource.match(/<WorkspaceDomainTabs/g) || []).length, 3, '桌面画布、桌面侧栏和移动菜单都必须提供工作区切换')
assert.match(shellSource, /data-navigation-workspace=\{activeWorkspace\}/, '应用壳必须暴露当前工作区状态')
assert.match(settingsSource, /当前工作区名称/, '配置页必须允许为每个工作区设置独立页面名称')
assert.match(settingsSource, /显示名称留空时使用系统名称/, '配置页必须说明页面显示名称的继承规则')
assert.match(settingsSource, /内部页面 ID、路由和权限不会改变/, '配置页必须说明重命名不会改变内部语义')
assert.match(routeSource, /requireResourcePermission\('system', 'update'\)/, '发布工作区配置必须受系统更新权限保护')

console.log('MES/MRP/ERP 工作区菜单归属、独立别名、顺序恢复和安全默认值验证通过')
